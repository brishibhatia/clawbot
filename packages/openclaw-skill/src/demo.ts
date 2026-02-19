import path from 'path';
import fs from 'fs';
import { DeepCleanSkill } from './index.js';

// Load .env from project root (no external dependency needed)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
        const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
        }
    }

}

async function main() {
    console.log('🚀 OpenClaw Skill Integration Test');

    const baseDir = path.resolve(process.cwd());
    const demoDir = path.join(baseDir, '.deepclean-demo');

    // Initialize skill
    const skill = new DeepCleanSkill({
        baseDir,
    });

    console.log(`\n1. Planning cleanup for ${demoDir}...`);
    const plan = await skill.plan(demoDir);
    console.log(`   Hash: ${plan.planHash}`);
    console.log(`   Actions: ${plan.actions.length}`);
    console.log(`   Summary: ${plan.summary}`);

    if (plan.actions.length > 0) {
        console.log(`\n2. Executing cleanup...`);
        const result = await skill.run(demoDir);

        if (result.status === 'success' && result.bundlePath) {
            console.log(`   Run ID: ${result.runId}`);
            console.log(`   Bundle: ${result.bundlePath}`);
            console.log(`   SHA256: ${result.bundleSha256}`);
            console.log(`   Tree Root: ${result.fileTreeRoot}`);
            console.log(`   Actions: ${result.actionCount}`);

            // Note: Proving requires active environment variables (SUI_PRIVATE_KEY)
            if (process.env.SUI_PRIVATE_KEY) {
                console.log(`\n3. Proving on chain...`);
                console.log({
                    runId: result.runId,
                    summary: result.summary,
                    policyHash: result.policyHash,
                    bundleSha256: result.bundleSha256,
                    planHash: result.planHash,
                    fileTreeRoot: result.fileTreeRoot,
                    actionCount: result.actionCount
                });
                try {
                    const proof = await skill.prove(
                        result.bundlePath,
                        result.runId,
                        result.summary,
                        result.policyHash,
                        result.bundleSha256,
                        result.planHash,
                        result.fileTreeRoot,
                        result.actionCount
                    );
                    console.log(`   Sui TX: ${proof.sui.txDigest}`);
                    console.log(`   Walrus Blob: ${proof.walrus.blobId}`);

                    console.log(`\n4. Verifying...`);
                    const verification = await skill.verify(proof.sui.objectId);
                    console.log(`   Verified: ${verification.verified}`);
                    if (verification.verified) {
                        console.log(`   Agent ID: ${verification.agentId}`);
                        console.log(`   Signature: ${verification.signature.slice(0, 10)}... (valid)`);
                        console.log(`   Verify manually: curl ${proof.walrus.url}`);
                        console.log(`   Sui Explorer: https://suiscan.xyz/testnet/object/${proof.sui.objectId}`);
                    } else {
                        console.log(`   Reason: ${verification.reason}`);
                    }
                } catch (err) {
                    console.error('Proving failed:', err);
                }
            } else {
                console.warn('\n⚠️ Skipping Step 3 (Prove) - SUI_PRIVATE_KEY not set');
            }
        }
    } else {
        console.log('No actions to execute.');
    }
}

main().catch(console.error);
