import fs from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import pino from 'pino';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import { PoaCache } from './poa-cache.js';

const logger = pino({ name: 'deepclean-walrus' });

const DEFAULT_UPLOAD_RELAY = 'https://publisher.walrus-testnet.walrus.space';
const DEFAULT_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

export interface WalrusUploadResult {
    blobId: string;
    blobUrl: string;
    /** Sui tx digest for Walrus certify step (from alreadyCertified.event.txDigest or certifyOnSui) */
    walrusCertifyTx: string;
    /** "txDigest:eventSeq" when available (publisher alreadyCertified path) */
    walrusAvailabilityEventRef: string;
    /** sha256(confirmation_certificate bytes) — relay path only, empty for publisher */
    walrusConfirmationCertSha256: string;
}

export type WalrusMode = 'auto' | 'relay' | 'publisher';

interface TipConfig {
    tipRequired: boolean;
    tipAddress?: string;
    tipAmount?: number;
}

interface TipPaymentResult {
    txId: string;
    nonce: string; // Base64url encoded
}

/**
 * Restore keypair from env. Expects base64-encoded secret key.
 */
function getKeypair(): Ed25519Keypair {
    const key = process.env.SUI_PRIVATE_KEY;
    if (!key) {
        throw new Error('SUI_PRIVATE_KEY env var is required for paid Walrus uploads');
    }
    // Support both raw base64 and suiprivkey format
    if (key.startsWith('suiprivkey')) {
        return Ed25519Keypair.fromSecretKey(key);
    }
    return Ed25519Keypair.fromSecretKey(fromBase64(key));
}

/**
 * Fetch relay tip configuration from /v1/tip-config.
 * Some relays require a SUI tip to process uploads.
 */
async function fetchTipConfig(relayHost: string): Promise<TipConfig> {
    try {
        const url = `${relayHost}/v1/tip-config`;
        logger.info({ url }, 'Checking relay tip configuration');
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) {
            logger.warn({ status: res.status }, 'tip-config endpoint unavailable — assuming no tip required');
            return { tipRequired: false };
        }
        const json = await res.json() as Record<string, any>;

        // Flexible parsing for tip config
        let tipAddress: string | undefined;
        let tipAmount: number | undefined;

        if (json.send_tip) {
            tipAddress = json.send_tip.address;
            if (typeof json.send_tip.kind === 'object' && json.send_tip.kind.const) {
                tipAmount = Number(json.send_tip.kind.const);
            } else if (typeof json.send_tip.amount === 'number') {
                tipAmount = json.send_tip.amount;
            }
        } else if (json.tipAddress && json.tipAmount) {
            tipAddress = json.tipAddress;
            tipAmount = Number(json.tipAmount);
        }

        const tipRequired = Boolean(tipAddress && tipAmount && tipAmount > 0);
        logger.info({ tipRequired, tipAddress, tipAmount }, 'Relay tip config');

        return {
            tipRequired,
            tipAddress,
            tipAmount,
        };
    } catch (err) {
        logger.warn({ err }, 'Failed to fetch tip-config — assuming no tip required');
        return { tipRequired: false };
    }
}

/**
 * Pay the relay tip via a Sui PTB.
 * Input 0 must be bcs(sha256(blob) || sha256(nonce) || blob_len).
 */
async function payRelayTip(blob: Buffer, tipAddress: string, tipAmount: number): Promise<TipPaymentResult> {
    const keypair = getKeypair();
    const network = (process.env.SUI_NETWORK as 'testnet' | 'mainnet') || 'testnet';
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(network);
    const client = new SuiClient({ url: rpcUrl });

    // 1. Prepare Auth Message
    const blobDigest = createHash('sha256').update(blob).digest();
    const nonceBytes = randomBytes(32);
    const nonceDigest = createHash('sha256').update(nonceBytes).digest();

    // unencoded_length (u64 little endian)
    const lenBuffer = Buffer.alloc(8);
    lenBuffer.writeBigUInt64LE(BigInt(blob.length));

    // Concatenate: blob_digest || nonce_digest || unencoded_length
    const authMsg = Buffer.concat([blobDigest, nonceDigest, lenBuffer]);

    logger.info({ tipAddress, tipAmount, blobLen: blob.length }, 'Paying relay tip on Sui');

    const tx = new Transaction();

    // Input 0: Auth Message (vector<u8>)
    // Using purely bcs.vector(bcs.u8()).serialize(...) to ensure correct BCS serialization of the vector
    tx.pure(bcs.vector(bcs.u8()).serialize(authMsg));

    // Pay tip
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(tipAmount)]);
    tx.transferObjects([coin], tx.pure.address(tipAddress));

    const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
    });

    logger.info({ txDigest: result.digest }, 'Tip paid successfully');

    // Walrus uses unpadded base64url for nonce query param
    const nonceBase64Url = nonceBytes.toString('base64url').replace(/=/g, '');

    return {
        txId: result.digest,
        nonce: nonceBase64Url,
    };
}

/**
 * Upload a proof bundle zip to Walrus via the upload relay.
 * Pre-checks /v1/tip-config to determine if a tip is required.
 * Retries once on 5xx errors.
 * @param mode - 'auto' (default): detect via tip-config. 'relay': force relay path. 'publisher': force publisher path.
 */
export async function uploadToWalrus(zipPath: string, mode: WalrusMode = 'auto'): Promise<WalrusUploadResult> {
    const relayHost = process.env.WALRUS_UPLOAD_RELAY || DEFAULT_UPLOAD_RELAY;
    const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL || DEFAULT_AGGREGATOR;

    const fileData = fs.readFileSync(zipPath);

    // Pre-flight: check tip config
    const tipConfig = await fetchTipConfig(relayHost);

    let tipParams = '';

    if (tipConfig.tipRequired && tipConfig.tipAddress && tipConfig.tipAmount) {
        try {
            const { txId, nonce } = await payRelayTip(fileData, tipConfig.tipAddress, tipConfig.tipAmount);
            tipParams = `&tx_id=${txId}&nonce=${nonce}`;
        } catch (err) {
            logger.error({ err }, 'Failed to pay relay tip');
            throw new Error('Failed to pay relay tip. Check SUI_PRIVATE_KEY and balance.');
        }
    }

    logger.info({ zipPath, relayHost }, 'Uploading proof bundle to Walrus');

    // Endpoint selection based on host type:
    // 1. Publisher (free): tip-config returns 404. Use /v1/blobs?epochs=1.
    // 2. Relay (paid): tip-config returns 200. Use /v1/store?epochs=1 (since blobs 404s there).

    // We determine this by the presence of tipConfig.
    // (In fetchTipConfig, 404 results in tipRequired=false).

    // However, we also need to know if we are on a RELAY (which supports store) or PUBLISHER (which supports blobs).
    // The previous logic assumed 404 = Publisher.

    let endpoint = 'v1/blobs'; // Default for publisher
    let isRelay = tipConfig.tipRequired;

    // Mode override
    if (mode === 'relay') {
        isRelay = true;
        logger.info('Forced relay mode via --walrus-mode relay');
    } else if (mode === 'publisher') {
        isRelay = false;
        logger.info('Forced publisher mode via --walrus-mode publisher');
    }

    if (isRelay) {
        // Upload relay endpoint per Walrus docs
        endpoint = 'v1/blob-upload-relay';
    }

    const url = `${relayHost}/${endpoint}?epochs=1${tipParams}`;
    const method = isRelay ? 'POST' : 'PUT';

    // Upload with 1 retry on server errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/octet-stream' },
                body: fileData,
            });

            if (response.ok) {
                const json = await response.json() as Record<string, any>;

                // ── Parse PoA data from response ──
                let blobId = 'unknown';
                let walrusCertifyTx = '';
                let walrusAvailabilityEventRef = '';
                let walrusConfirmationCertSha256 = '';

                if (json.alreadyCertified) {
                    // Publisher path: blob was previously certified
                    blobId = json.alreadyCertified.blobId ?? 'unknown';
                    const evt = json.alreadyCertified.event;
                    if (evt?.txDigest) {
                        walrusCertifyTx = evt.txDigest;
                        walrusAvailabilityEventRef = `${evt.txDigest}:${evt.eventSeq ?? 0}`;
                    }
                } else if (json.newlyCreated) {
                    // Publisher path: freshly registered (certifiedEpoch may be null)
                    blobId = json.newlyCreated.blobObject?.blobId ?? 'unknown';
                    // No certify tx available yet for fresh uploads
                }

                // Relay path: check for confirmation_certificate
                if (isRelay && json.confirmation_certificate) {
                    blobId = json.blob_id ?? blobId;
                    const certBytes = typeof json.confirmation_certificate === 'string'
                        ? Buffer.from(json.confirmation_certificate, 'base64')
                        : Buffer.from(JSON.stringify(json.confirmation_certificate));
                    walrusConfirmationCertSha256 = createHash('sha256').update(certBytes).digest('hex');
                    // certifyOnSui() will be called by the prove command
                    // walrusCertifyTx will be set there
                }

                logger.info({ blobId, walrusCertifyTx, isRelay }, 'Successfully uploaded to Walrus');

                // Cache PoA data for future lookups
                const cache = new PoaCache();
                if (walrusCertifyTx || walrusConfirmationCertSha256) {
                    cache.set(blobId, {
                        certifyTxDigest: walrusCertifyTx,
                        availabilityEventRef: walrusAvailabilityEventRef,
                        confirmationCertSha256: walrusConfirmationCertSha256,
                    });
                } else {
                    // Check if we have cached PoA from a previous upload of this blob
                    const cached = cache.get(blobId);
                    if (cached) {
                        walrusCertifyTx = cached.certifyTxDigest;
                        walrusAvailabilityEventRef = cached.availabilityEventRef;
                        walrusConfirmationCertSha256 = cached.confirmationCertSha256;
                        logger.info({ blobId }, 'Restored PoA data from local cache');
                    }
                }

                return {
                    blobId,
                    blobUrl: `${aggregatorUrl}/v1/blobs/${blobId}`,
                    walrusCertifyTx,
                    walrusAvailabilityEventRef,
                    walrusConfirmationCertSha256,
                };
            }

            const text = await response.text();

            // Retry on 5xx
            if (response.status >= 500 && attempt === 0) {
                logger.warn({ status: response.status }, 'Walrus relay 5xx — retrying in 2s');
                await new Promise((r) => setTimeout(r, 2000));
                lastError = new Error(`Walrus upload failed (${response.status}): ${text}`);
                continue;
            }

            throw new Error(
                `Walrus upload failed (${response.status}): ${text}\n` +
                `  Relay: ${url}\n` +
                `  Tip-config: ${JSON.stringify(tipConfig)}`
            );
        } catch (err) {
            if (attempt === 0 && !(err instanceof Error && err.message.startsWith('Walrus upload failed'))) {
                logger.warn({ err }, 'Walrus upload network error — retrying in 2s');
                await new Promise((r) => setTimeout(r, 2000));
                lastError = err as Error;
                continue;
            }
            throw err;
        }
    }

    throw lastError ?? new Error('Walrus upload failed after retries');
}

/**
 * Download a blob from Walrus by blob ID.
 */
export async function downloadFromWalrus(blobId: string): Promise<Buffer> {
    const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL || DEFAULT_AGGREGATOR;
    const url = `${aggregatorUrl}/v1/blobs/${blobId}`;

    logger.info({ url }, 'Downloading from Walrus');

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Walrus download failed (${response.status})\n` +
            `  URL: ${url}\n` +
            `  Hint: Check the blob ID and aggregator URL`
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
