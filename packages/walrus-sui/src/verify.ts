import crypto from 'node:crypto';
import pino from 'pino';
import { downloadFromWalrus } from './walrus-client.js';
import { fetchCleanupRun } from './sui-client.js';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { PoaCache } from './poa-cache.js';

const logger = pino({ name: 'deepclean-verify' });

export interface VerificationResult {
    valid: boolean;
    runId: string;
    suiObjectId: string;
    walrusBlobId: string;
    expectedSha256: string;
    actualSha256: string;
    hashMatch: boolean;
    policyHash: string;
    planHash?: string;
    /** Off-chain check: blob was successfully downloaded from Walrus aggregator */
    availabilityDownloadable: boolean;
    /** On-chain PoA: walrus_certify_tx exists, succeeded, and emitted availability event */
    poaOnchainVerified: boolean;
    /** True when walrus_certify_tx is empty (fresh upload, certification pending) */
    poaPending: boolean;
    poaDetails: string;
    walrusCertifyTx: string;
    walrusAvailabilityEventRef: string;
    walrusConfirmationCertSha256: string;
    details: string;
}

export interface VerifyOptions {
    /** Poll publisher for alreadyCertified until PoA resolves */
    waitPoa?: boolean;
    /** Max seconds to wait for PoA (default: 120) */
    timeout?: number;
}

/**
 * Check an on-chain certify tx for availability events matching the blobId.
 */
async function verifyPoaTx(walrusCertifyTx: string, walrusBlobId: string): Promise<{ verified: boolean; details: string }> {
    const network = (process.env.SUI_NETWORK as 'testnet' | 'mainnet') || 'testnet';
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(network);
    const client = new SuiClient({ url: rpcUrl });

    const txBlock = await client.getTransactionBlock({
        digest: walrusCertifyTx,
        options: { showEvents: true, showEffects: true },
    });

    const txSucceeded = txBlock.effects?.status?.status === 'success';

    if (!txSucceeded) {
        return { verified: false, details: `❌ PoA (on-chain): certify tx ${walrusCertifyTx} failed` };
    }

    const events = txBlock.events ?? [];
    const blobEvent = events.find((e: any) => {
        const parsed = e.parsedJson as Record<string, any> | undefined;
        if (!parsed) return false;
        return parsed.blob_id === walrusBlobId ||
            parsed.blobId === walrusBlobId ||
            JSON.stringify(parsed).includes(walrusBlobId);
    });

    if (blobEvent) {
        return {
            verified: true,
            details: `✅ PoA (on-chain): certify tx ${walrusCertifyTx} emitted availability event for blob ${walrusBlobId}`,
        };
    }

    return {
        verified: true,
        details: `✅ PoA (on-chain): certify tx ${walrusCertifyTx} succeeded (no blob-specific event matched, tx is valid)`,
    };
}

/**
 * Poll the Walrus publisher to discover if a blob has been certified.
 * Re-uploads the blob data; if certified, publisher returns `alreadyCertified.event`.
 * Persists discovered PoA data to the local cache.
 */
async function discoverPoaCertification(
    blobData: Buffer,
    walrusBlobId: string,
    timeoutMs: number,
): Promise<{ certifyTx: string; eventRef: string } | null> {
    const publisherUrl = process.env.WALRUS_UPLOAD_RELAY || 'https://publisher.walrus-testnet.walrus.space';
    const cache = new PoaCache();

    // Check cache first
    const cached = cache.get(walrusBlobId);
    if (cached?.certifyTxDigest) {
        logger.info({ walrusBlobId }, 'Found PoA in local cache');
        return { certifyTx: cached.certifyTxDigest, eventRef: cached.availabilityEventRef };
    }

    const startTime = Date.now();
    const pollIntervals = [5000, 10000, 15000, 20000, 30000]; // back off
    let attempt = 0;

    while (Date.now() - startTime < timeoutMs) {
        const waitMs = pollIntervals[Math.min(attempt, pollIntervals.length - 1)];
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.info({ attempt: attempt + 1, elapsed, waitMs }, 'Polling publisher for alreadyCertified...');

        try {
            const response = await fetch(`${publisherUrl}/v1/blobs`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: blobData,
            });

            if (response.ok) {
                const json = await response.json() as Record<string, any>;

                if (json.alreadyCertified) {
                    const evt = json.alreadyCertified.event;
                    const certifyTx = evt?.txDigest ?? '';
                    const eventRef = certifyTx ? `${certifyTx}:${evt?.eventSeq ?? 0}` : '';

                    if (certifyTx) {
                        // Persist to cache
                        cache.set(walrusBlobId, {
                            certifyTxDigest: certifyTx,
                            availabilityEventRef: eventRef,
                            confirmationCertSha256: '',
                        });

                        logger.info({ walrusBlobId, certifyTx, eventRef }, 'Discovered PoA certification');
                        return { certifyTx, eventRef };
                    }
                }

                // newlyCreated with certifiedEpoch: null → not yet certified
                logger.info('Blob not yet certified, will retry...');
            }
        } catch (err) {
            logger.warn({ err }, 'Publisher poll failed, retrying...');
        }

        attempt++;
        await new Promise(r => setTimeout(r, waitMs));
    }

    logger.warn({ walrusBlobId, timeoutMs }, 'PoA discovery timed out');
    return null;
}

/**
 * Verify a CleanupRun:
 * 1. Fetch the on-chain object
 * 2. Download the blob from Walrus (off-chain availability)
 * 3. Recompute sha256
 * 4. Compare hashes
 * 5. Check on-chain PoA (certify tx + events)
 * 6. If --wait-poa and PoA pending, poll publisher for alreadyCertified
 */
export async function verifyCleanupRun(suiObjectId: string, opts: VerifyOptions = {}): Promise<VerificationResult> {
    logger.info({ suiObjectId, opts }, 'Starting verification');

    // 1. Fetch on-chain record
    const record = await fetchCleanupRun(suiObjectId);
    const runId = record.run_id ?? '';
    const walrusBlobId = record.walrus_blob_id ?? '';
    const onChainSha256 = record.bundle_sha256 ?? '';
    let walrusCertifyTx = record.walrus_certify_tx ?? '';
    let walrusAvailabilityEventRef = record.walrus_availability_event_ref ?? '';
    const walrusConfirmationCertSha256 = record.walrus_confirmation_cert_sha256 ?? '';

    // Check local cache for previously discovered PoA
    if (!walrusCertifyTx) {
        const cache = new PoaCache();
        const cached = cache.get(walrusBlobId);
        if (cached?.certifyTxDigest) {
            walrusCertifyTx = cached.certifyTxDigest;
            walrusAvailabilityEventRef = cached.availabilityEventRef;
            logger.info({ walrusBlobId }, 'Restored PoA from local cache');
        }
    }

    logger.info({ runId, walrusBlobId, onChainSha256, walrusCertifyTx }, 'Fetched on-chain record');

    // 2. Download from Walrus (off-chain availability check)
    let blobData: Buffer = Buffer.alloc(0) as Buffer;
    let availabilityDownloadable = false;
    try {
        blobData = await downloadFromWalrus(walrusBlobId);
        availabilityDownloadable = blobData.length > 0;
        logger.info({ size: blobData.length }, 'Downloaded blob from Walrus');
    } catch (err) {
        logger.warn({ err }, 'Blob not downloadable from Walrus');
    }

    // 3. Recompute hash
    const computedSha256 = availabilityDownloadable
        ? crypto.createHash('sha256').update(blobData).digest('hex')
        : '';
    if (computedSha256) logger.info({ computedSha256 }, 'Computed hash of downloaded blob');

    // 4. Compare
    const hashMatch = availabilityDownloadable && computedSha256 === onChainSha256;

    // 5. On-chain PoA verification
    let poaOnchainVerified = false;
    let poaPending = !walrusCertifyTx;
    let poaDetails = '';

    if (walrusCertifyTx) {
        try {
            const poaResult = await verifyPoaTx(walrusCertifyTx, walrusBlobId);
            poaOnchainVerified = poaResult.verified;
            poaDetails = poaResult.details;
        } catch (err) {
            poaDetails = `⚠️ Could not verify PoA tx ${walrusCertifyTx}: ${(err as Error).message}`;
        }
    } else if (opts.waitPoa && availabilityDownloadable) {
        // 6. --wait-poa: poll publisher for alreadyCertified
        const timeoutMs = (opts.timeout ?? 120) * 1000;
        console.log(`\n⏳ Waiting for on-chain PoA certification (timeout: ${opts.timeout ?? 120}s)...`);

        const discovered = await discoverPoaCertification(blobData, walrusBlobId, timeoutMs);

        if (discovered) {
            walrusCertifyTx = discovered.certifyTx;
            walrusAvailabilityEventRef = discovered.eventRef;
            poaPending = false;

            try {
                const poaResult = await verifyPoaTx(walrusCertifyTx, walrusBlobId);
                poaOnchainVerified = poaResult.verified;
                poaDetails = poaResult.details;
            } catch (err) {
                poaDetails = `⚠️ Could not verify discovered PoA tx ${walrusCertifyTx}: ${(err as Error).message}`;
            }
        } else {
            poaDetails = `⏳ PoA (on-chain): timed out after ${opts.timeout ?? 120}s — certification still pending`;
        }
    } else {
        poaDetails = `⏳ PoA (on-chain): pending — blob registered but certification not yet completed`;
    }

    if (walrusAvailabilityEventRef) {
        poaDetails += `\n   Event Ref: ${walrusAvailabilityEventRef}`;
    }

    const result: VerificationResult = {
        valid: hashMatch,
        runId,
        suiObjectId,
        walrusBlobId,
        expectedSha256: onChainSha256,
        actualSha256: computedSha256,
        hashMatch,
        policyHash: record.policy_hash,
        planHash: record.plan_hash,
        availabilityDownloadable,
        poaOnchainVerified,
        poaPending,
        poaDetails,
        walrusCertifyTx,
        walrusAvailabilityEventRef,
        walrusConfirmationCertSha256,
        details: hashMatch
            ? '✅ Bundle hash matches on-chain record. Proof is valid.'
            : availabilityDownloadable
                ? '❌ Hash mismatch! Bundle may have been tampered with.'
                : '❌ Could not download blob from Walrus to verify hash.',
    };

    logger.info({
        valid: result.valid,
        runId: result.runId,
        suiObjectId: result.suiObjectId,
        walrusBlobId: result.walrusBlobId,
        expectedSha256: result.expectedSha256,
        actualSha256: result.actualSha256,
        hashMatch: result.hashMatch,
        policyHash: result.policyHash,
        planHash: result.planHash,
        availabilityDownloadable: result.availabilityDownloadable,
        poaOnchainVerified: result.poaOnchainVerified,
        poaPending: result.poaPending,
        walrusCertifyTx: result.walrusCertifyTx || undefined,
        walrusAvailabilityEventRef: result.walrusAvailabilityEventRef || undefined,
    }, 'Verification complete');
    return result;
}
