import path from 'path';
import { DeepCleanSkill } from './index.js';

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

            // Note: Proving requires active environment variables (SUI_PRIVATE_KEY)
            if (process.env.SUI_PRIVATE_KEY) {
                console.log(`\n3. Proving on chain...`);
                try {
                    const proof = await skill.prove(
                        result.bundlePath,
                        result.runId!,
                        result.summary!,
                        result.policyHash!,
                        result.bundleSha256!
                    );
                    console.log(`   Sui TX: ${proof.sui.txDigest}`);
                    console.log(`   Walrus Blob: ${proof.walrus.blobId}`);

                    console.log(`\n4. Verifying...`);
                    const verification = await skill.verify(proof.sui.objectId);
                    console.log(`   Verified: ${verification.verified}`);
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
