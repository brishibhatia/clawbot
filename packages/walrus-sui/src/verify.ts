import crypto from 'node:crypto';
import pino from 'pino';
import { downloadFromWalrus } from './walrus-client.js';
import { fetchCleanupRun } from './sui-client.js';

const logger = pino({ name: 'deepclean-verify' });

export interface VerificationResult {
    valid: boolean;
    runId: string;
    suiObjectId: string;
    walrusBlobId: string;
    expectedSha256: string;
    actualSha256: string;
    hashMatch: boolean;
    details: string;
}

/**
 * Verify a CleanupRun:
 * 1. Fetch the on-chain object to get walrusBlobId + bundleSha256
 * 2. Download the blob from Walrus
 * 3. Recompute sha256 of the downloaded blob
 * 4. Compare hashes
 */
export async function verifyCleanupRun(suiObjectId: string): Promise<VerificationResult> {
    logger.info({ suiObjectId }, 'Starting verification');

    // 1. Fetch on-chain record
    const fields = await fetchCleanupRun(suiObjectId);
    const runId = fields.run_id ?? '';
    const walrusBlobId = fields.walrus_blob_id ?? '';
    const expectedSha256 = fields.bundle_sha256 ?? '';

    logger.info({ runId, walrusBlobId, expectedSha256 }, 'Fetched on-chain record');

    // 2. Download from Walrus
    const blobData = await downloadFromWalrus(walrusBlobId);
    logger.info({ size: blobData.length }, 'Downloaded blob from Walrus');

    // 3. Recompute hash
    const actualSha256 = crypto.createHash('sha256').update(blobData).digest('hex');
    logger.info({ actualSha256 }, 'Computed hash of downloaded blob');

    // 4. Compare
    const hashMatch = actualSha256 === expectedSha256;

    const result: VerificationResult = {
        valid: hashMatch,
        runId,
        suiObjectId,
        walrusBlobId,
        expectedSha256,
        actualSha256,
        hashMatch,
        details: hashMatch
            ? '✅ Bundle hash matches on-chain record. Proof is valid.'
            : '❌ Hash mismatch! Bundle may have been tampered with.',
    };

    logger.info(result, 'Verification complete');
    return result;
}
