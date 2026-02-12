import { Command } from 'commander';
import { verifyCleanupRun } from '@deepclean/walrus-sui';

export const verifyCommand = new Command('verify')
    .description('Verify a CleanupRun by downloading from Walrus and checking the Sui record')
    .requiredOption('--object <objectId>', 'Sui object ID of the CleanupRun')
    .action(async (opts) => {
        console.log('🔍 Verifying CleanupRun...');
        console.log(`   Sui Object: ${opts.object}`);
        console.log('   (No local secrets required — using public SUI_RPC_URL and WALRUS_AGGREGATOR_URL)');
        console.log('');

        try {
            const result = await verifyCleanupRun(opts.object);

            console.log('── Verification Result ──────────────────────');
            console.log(`   Run ID:          ${result.runId}`);
            console.log(`   Walrus Blob ID:  ${result.walrusBlobId}`);
            console.log(`   Expected SHA256: ${result.expectedSha256}`);
            console.log(`   Actual SHA256:   ${result.actualSha256}`);
            console.log(`   Hash Match:      ${result.hashMatch ? '✅ YES' : '❌ NO'}`);
            if (result.planHash) {
                console.log(`   Plan Hash:       ${result.planHash}`);
            }
            console.log('');
            console.log(`   ${result.details}`);
        } catch (err) {
            console.error(`❌ Verification failed: ${err instanceof Error ? err.message : err}`);
            process.exit(1);
        }
    });
