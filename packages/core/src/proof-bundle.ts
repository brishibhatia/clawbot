import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import archiver from 'archiver';
import { getFileTree } from './planner.js';
import type { ActionPlan, ActionResult, ProofManifest, DeepCleanConfig } from './types.js';

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function buildManifest(
    plan: ActionPlan,
    results: ActionResult[],
    rootPath: string,
    fileTreeBefore: string[],
    fileTreeAfter: string[]
): ProofManifest {
    return {
        runId: plan.runId,
        startTimestamp: plan.timestamp,
        endTimestamp: new Date().toISOString(),
        policyVersion: plan.policyVersion,
        policyHash: plan.policyHash,
        planHash: plan.planHash,
        environment: {
            os: `${process.platform}-${process.arch}`,
            nodeVersion: process.version,
            toolVersions: {
                deepclean: '0.1.0',
            },
        },
        plannedActions: plan.actions,
        executedActions: results,
        fileTreeBefore,
        fileTreeAfter,
        bundleSha256: '', // filled after zip
        summary: `${results.filter(r => r.success).length}/${results.length} actions succeeded`,
    };
}

export async function createProofBundle(
    manifest: ProofManifest,
    config: DeepCleanConfig,
    logs: string = ''
): Promise<{ zipPath: string; sha256: string; manifest: ProofManifest }> {
    ensureDir(config.proofsDir);

    const bundleName = `deepclean-proof-${manifest.runId}`;
    const bundleDir = path.join(config.proofsDir, bundleName);
    ensureDir(bundleDir);

    // Write manifest JSON (without final sha256 first)
    const manifestPath = path.join(bundleDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Write logs
    if (logs) {
        fs.writeFileSync(path.join(bundleDir, 'output.log'), logs);
    }

    // Write file tree snapshots
    fs.writeFileSync(
        path.join(bundleDir, 'file-tree-before.txt'),
        manifest.fileTreeBefore.join('\n')
    );
    fs.writeFileSync(
        path.join(bundleDir, 'file-tree-after.txt'),
        manifest.fileTreeAfter.join('\n')
    );

    // Write explainable diffs (human-readable)
    const diffText = manifest.executedActions
        .map(a => `[${a.type.toUpperCase()}] ${a.sourcePath} -> ${a.success ? (a.targetPath || 'DONE') : 'FAILED: ' + a.reason}`)
        .join('\n');
    fs.writeFileSync(path.join(bundleDir, 'tree_diff.txt'), diffText);

    // Write NDJSON actions log (machine-readable streaming)
    const ndjson = manifest.executedActions.map(a => JSON.stringify(a)).join('\n');
    fs.writeFileSync(path.join(bundleDir, 'actions.jsonl'), ndjson);

    // Create zip
    const zipPath = path.join(config.proofsDir, `${bundleName}.zip`);
    await zipDirectory(bundleDir, zipPath);

    // Compute sha256 of the zip
    const sha256 = computeZipHash(zipPath);
    manifest.bundleSha256 = sha256;

    // Rewrite manifest with sha256 included
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Also write final manifest alongside zip
    fs.writeFileSync(
        path.join(config.proofsDir, `${bundleName}-manifest.json`),
        JSON.stringify(manifest, null, 2)
    );

    return { zipPath, sha256, manifest };
}

function zipDirectory(sourceDir: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

export function computeZipHash(zipPath: string): string {
    const content = fs.readFileSync(zipPath);
    return crypto.createHash('sha256').update(content).digest('hex');
}
