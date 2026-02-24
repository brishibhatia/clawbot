import * as path from 'node:path';
import * as fs from 'node:fs';
import {
    generatePlan,
    executePlan,
    loadPolicy,
    DeepCleanConfig,
    getFileTree,
    buildManifest,
    createProofBundle,
    AgentIdentity
} from '@deepclean/core';
import {
    uploadToWalrus,
    anchorOnSui,
    downloadFromWalrus,
    fetchCleanupRun
} from '@deepclean/walrus-sui';

export interface DeepCleanSkillConfig {
    baseDir: string;
    quarantineDir?: string;
    stagingDir?: string;
    proofsDir?: string;
}

export class DeepCleanSkill {
    private config: DeepCleanConfig;
    private policyPath: string;
    private identity: AgentIdentity;

    constructor(config: DeepCleanSkillConfig) {
        const baseDir = path.resolve(config.baseDir);
        this.config = {
            roots: [baseDir], // Default root to baseDir
            allowedActions: ['quarantine', 'dedupe', 'rename', 'unzip'],
            quarantineDir: config.quarantineDir ? path.resolve(config.quarantineDir) : path.join(baseDir, '.deepclean', 'quarantine'),
            stagingDir: config.stagingDir ? path.resolve(config.stagingDir) : path.join(baseDir, '.deepclean', 'staging'),
            proofsDir: config.proofsDir ? path.resolve(config.proofsDir) : path.join(baseDir, '.deepclean', 'proofs'),
            schedule: 'manual',
            maxCpuPercent: 50,
            dryRunByDefault: false,
        };
        this.policyPath = path.join(baseDir, 'policy.json');

        // Initialize Agent Identity (auto-generates key if missing)
        const identityPath = path.join(baseDir, '.agent-identity');
        this.identity = new AgentIdentity(identityPath);
        console.log(`Agent Identity: ${this.identity.agentId}`);

        // Ensure dirs exist
        const dirs = [this.config.quarantineDir, this.config.stagingDir, this.config.proofsDir];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Generate a dry-run cleanup plan.
     */
    async plan(targetPath: string) {
        console.log(`Analyzing ${targetPath}...`);
        const plan = await generatePlan(targetPath, this.config, this.policyPath, true); // dryRun=true
        return {
            summary: plan.summary,
            actions: plan.actions.map(a => ({
                type: a.type,
                file: path.relative(targetPath, a.sourcePath),
                reason: a.reason
            })),
            planHash: plan.planHash,
            policyHash: plan.policyHash,
            stats: {
                totalFiles: plan.fileCount,
                actionsCount: plan.actions.length
            }
        };
    }

    /**
     * Execute cleanup and generate proof bundle.
     */
    async run(targetPath: string) {
        console.log(`Cleaning ${targetPath}...`);

        const fileTreeBefore = getFileTree(targetPath);

        // 1. Plan
        const plan = await generatePlan(targetPath, this.config, this.policyPath, false); // dryRun=false

        if (plan.actions.length === 0) {
            return { status: 'skipped', message: 'No actions to perform' };
        }

        // 2. Execute
        const results = await executePlan(plan);

        // 3. Build Proof Bundle
        const fileTreeAfter = getFileTree(targetPath);

        const logOutput = results
            .map(r => `[${r.type}] ${r.sourcePath} → ${r.success ? 'OK' : `FAIL: ${r.error || ''}`}`)
            .join('\n');

        const manifest = buildManifest(plan, results, targetPath, fileTreeBefore, fileTreeAfter);
        const bundle = await createProofBundle(manifest, this.config, logOutput);

        return {
            status: 'success',
            runId: plan.runId,
            bundlePath: bundle.zipPath,
            bundleSha256: bundle.sha256,
            policyHash: plan.policyHash, // Required for proving
            planHash: plan.planHash,
            fileTreeRoot: bundle.manifest.fileTreeRoot, // Use manifest.fileTreeRoot
            actionCount: bundle.manifest.actionCount,
            summary: plan.summary,
            actionsExecuted: results.filter(r => r.success).length,
            failures: results.filter(r => !r.success).length
        };
    }

    /**
     * Upload proof bundle to Walrus and anchor on Sui.
     */
    async prove(bundlePath: string, runId: string, summary: string, policyHash: string, bundleSha256: string, planHash: string, fileTreeRoot: string, actionCount: number) {
        console.log(`Proving run ${runId}...`);
        console.log(`Agent signing run with key: ${this.identity.agentId}`);

        // Sign the data (bundleSha256)
        const message = new TextEncoder().encode(bundleSha256);
        const signature = await this.identity.sign(message);

        // 1. Upload to Walrus (with auto-tipping)
        const upload = await uploadToWalrus(bundlePath);

        // 2. Anchor on Sui
        const anchor = await anchorOnSui({
            packageId: process.env.DEEPCLEAN_PACKAGE_ID!,
            runId,
            walrusBlobId: upload.blobId,
            bundleSha256, // Caller provides SHA256 from run() output
            summary,
            policyHash,
            planHash,
            fileTreeRoot,
            actionCount,
            agentId: this.identity.agentId,
            signature: Array.from(signature),
            walrusCertifyTx: upload.walrusCertifyTx,
            walrusAvailabilityEventRef: upload.walrusAvailabilityEventRef,
            walrusConfirmationCertSha256: upload.walrusConfirmationCertSha256,
        });
        return {
            status: 'proven',
            walrus: {
                blobId: upload.blobId,
                url: upload.blobUrl
            },
            sui: {
                txDigest: anchor.txDigest,
                objectId: anchor.objectId
            },
            poa: {
                walrusCertifyTx: upload.walrusCertifyTx || 'pending',
                walrusAvailabilityEventRef: upload.walrusAvailabilityEventRef || '',
                walrusConfirmationCertSha256: upload.walrusConfirmationCertSha256 || '',
            }
        };
    }

    /**
     * Verify a run by downloading from Walrus and checking Sui.
     */
    async verify(suiObjectId: string) {
        console.log(`Verifying ${suiObjectId}...`);
        const runRecord = await fetchCleanupRun(suiObjectId);
        const blobId = runRecord.walrus_blob_id;
        const storedHash = runRecord.bundle_sha256;

        const blobBuffer = await downloadFromWalrus(blobId);

        // Dynamically import crypto to avoid top-level node dependency issues if bundled differently
        const crypto = await import('node:crypto');
        const computedSha256 = crypto.createHash('sha256').update(blobBuffer).digest('hex');

        const isMatch = computedSha256 === storedHash;

        return {
            verified: isMatch,
            reason: isMatch ? undefined : `SHA256 mismatch: stored=${storedHash}, computed=${computedSha256}`,
            runId: runRecord.run_id,
            timestampMs: runRecord.timestamp_ms,
            storedHash,
            computedHash: computedSha256,
            agentId: runRecord.agent_id,
            signature: runRecord.signature
        };
    }
}
