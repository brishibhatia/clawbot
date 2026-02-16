import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { uploadToWalrus } from '@deepclean/walrus-sui';
import { anchorOnSui } from '@deepclean/walrus-sui';
import { loadConfig } from '../config.js';
import type { ProofManifest } from '@deepclean/core';

export const proveCommand = new Command('prove')
    .description('Upload proof bundle to Walrus and anchor on Sui')
    .requiredOption('--run <runId>', 'Run ID to prove')
    .option('--config <path>', 'Path to deepclean.config.json')
    .action(async (opts) => {
        const config = loadConfig(opts.config);
        const runId = opts.run;

        // Find the bundle and manifest
        const bundleName = `deepclean-proof-${runId}`;
        const zipPath = path.join(config.proofsDir, `${bundleName}.zip`);
        const manifestPath = path.join(config.proofsDir, `${bundleName}-manifest.json`);

        if (!fs.existsSync(zipPath)) {
            console.error(`❌ Bundle not found: ${zipPath}`);
            console.error(`   Run 'deepclean-cli run' first to generate a proof bundle.`);
            process.exit(1);
        }

        const manifest: ProofManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        console.log('🌊 Uploading proof bundle to Walrus...');
        console.log(`   ZIP:    ${zipPath}`);
        console.log(`   SHA256: ${manifest.bundleSha256}`);

        // Upload to Walrus
        const walrusResult = await uploadToWalrus(zipPath);
        console.log(`\n✅ Uploaded to Walrus`);
        console.log(`   Blob ID: ${walrusResult.blobId}`);
        console.log(`   URL:     ${walrusResult.blobUrl}`);

        // Anchor on Sui
        const packageId = process.env.DEEPCLEAN_PACKAGE_ID;
        if (!packageId) {
            console.log('\n⚠️  DEEPCLEAN_PACKAGE_ID not set — skipping Sui anchoring.');
            console.log('   Set this env var to the published Move package ID to anchor on-chain.');
            console.log('\n📝 Walrus upload complete. Manual Sui anchoring data:');
            console.log(JSON.stringify({
                runId,
                walrusBlobId: walrusResult.blobId,
                bundleSha256: manifest.bundleSha256,
                policyHash: manifest.policyHash,
                summary: manifest.summary,
            }, null, 2));
            return;
        }

        console.log('\n⛓️  Anchoring CleanupRun on Sui...');
        const suiResult = await anchorOnSui({
            packageId,
            runId,
            walrusBlobId: walrusResult.blobId,
            bundleSha256: manifest.bundleSha256,
            summary: manifest.summary,
            policyHash: manifest.policyHash,
            planHash: manifest.planHash,
        });

        console.log(`\n✅ Anchored on Sui`);
        console.log(`   TX Digest:  ${suiResult.txDigest}`);
        console.log(`   Object ID:  ${suiResult.objectId}`);
        console.log(`   Explorer:   https://suiscan.xyz/testnet/tx/${suiResult.txDigest}`);
        console.log(`   Object:     https://suiscan.xyz/testnet/object/${suiResult.objectId}`);

        // Copy-paste-friendly summary for judges / scripts
        console.log(`\n─── Copy-Paste IDs ─────────────────────────`);
        console.log(`walrus_blob_id=${walrusResult.blobId}`);
        console.log(`sui_object_id=${suiResult.objectId}`);
        console.log(`tx_digest=${suiResult.txDigest}`);
        console.log(`─────────────────────────────────────────────`);

        console.log(`\nVerify: node apps/deepclean-cli/dist/index.js verify --object ${suiResult.objectId}`);
        console.log(`Download: https://aggregator.walrus-testnet.walrus.space/v1/blobs/${walrusResult.blobId}`);
    });
