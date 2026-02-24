import { Command } from 'commander';
import { verifyCleanupRun } from '@deepclean/walrus-sui';

export const verifyCommand = new Command('verify')
    .description('Verify a CleanupRun by downloading from Walrus and checking the Sui record')
    .requiredOption('--object <objectId>', 'Sui object ID of the CleanupRun')
    .option('--show-poa', 'Show detailed Proof of Availability (PoA) information')
    .option('--wait-poa', 'Poll publisher until on-chain PoA certification is discovered')
    .option('--timeout <seconds>', 'Max seconds to wait for PoA (default: 120)', '120')
    .action(async (opts) => {
        console.log('🔍 Verifying CleanupRun...');
        console.log(`   Sui Object: ${opts.object}`);
        console.log('   (No local secrets required — using public SUI_RPC_URL and WALRUS_AGGREGATOR_URL)');
        console.log('');

        try {
            const result = await verifyCleanupRun(opts.object, {
                waitPoa: opts.waitPoa,
                timeout: parseInt(opts.timeout, 10),
            });

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
            console.log('');
            console.log('── Availability & PoA ──────────────────────');
            console.log(`   Availability (Walrus):  ${result.availabilityDownloadable ? '✅ YES' : '❌ NO'}`);
            console.log(`   PoA (on-chain):         ${result.poaOnchainVerified ? '✅ YES' : result.poaPending ? '⏳ PENDING' : '❌ NO'}`);
            console.log(`   ${result.poaDetails}`);

            if (opts.showPoa || opts.waitPoa) {
                console.log('');
                console.log('── PoA Details ─────────────────────────────');
                console.log(`   walrus_certify_tx:        ${result.walrusCertifyTx || '(pending)'}`);
                console.log(`   availability_event_ref:   ${result.walrusAvailabilityEventRef || '(none)'}`);
                console.log(`   confirmation_cert_sha256: ${result.walrusConfirmationCertSha256 || '(publisher mode)'}`);
            }
        } catch (err) {
            console.error(`❌ Verification failed: ${err instanceof Error ? err.message : err}`);
            process.exit(1);
        }
    });
