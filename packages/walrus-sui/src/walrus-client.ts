import fs from 'node:fs';
import pino from 'pino';

const logger = pino({ name: 'deepclean-walrus' });

const DEFAULT_UPLOAD_RELAY = 'https://upload-relay.testnet.walrus.space';
const DEFAULT_AGGREGATOR = 'https://aggregator.testnet.walrus.space';

export interface WalrusUploadResult {
    blobId: string;
    blobUrl: string;
}

interface TipConfig {
    tipRequired: boolean;
    tipAddress?: string;
    tipAmount?: number;
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
        const tipRequired = Boolean(json.tipAddress && json.tipAmount);
        logger.info({ tipRequired, tipAddress: json.tipAddress }, 'Relay tip config');
        return {
            tipRequired,
            tipAddress: json.tipAddress,
            tipAmount: json.tipAmount,
        };
    } catch (err) {
        logger.warn({ err }, 'Failed to fetch tip-config — assuming no tip required');
        return { tipRequired: false };
    }
}

/**
 * Upload a proof bundle zip to Walrus via the upload relay.
 * Pre-checks /v1/tip-config to determine if a tip is required.
 * Retries once on 5xx errors.
 */
export async function uploadToWalrus(zipPath: string): Promise<WalrusUploadResult> {
    const relayHost = process.env.WALRUS_UPLOAD_RELAY || DEFAULT_UPLOAD_RELAY;
    const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL || DEFAULT_AGGREGATOR;

    // Pre-flight: check tip config
    const tipConfig = await fetchTipConfig(relayHost);
    if (tipConfig.tipRequired) {
        logger.info(
            { tipAddress: tipConfig.tipAddress, tipAmount: tipConfig.tipAmount },
            'Relay requires a tip — ensure your account has SUI for tip payment'
        );
    }

    logger.info({ zipPath, relayHost }, 'Uploading proof bundle to Walrus');

    const fileData = fs.readFileSync(zipPath);
    const url = `${relayHost}/v1/blobs`;

    // Upload with 1 retry on server errors
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: fileData,
            });

            if (response.ok) {
                const json = await response.json() as Record<string, any>;
                const blobId =
                    json.newlyCreated?.blobObject?.blobId ??
                    json.alreadyCertified?.blobId ??
                    'unknown';

                logger.info({ blobId }, 'Successfully uploaded to Walrus');

                return {
                    blobId,
                    blobUrl: `${aggregatorUrl}/v1/blobs/${blobId}`,
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
                `  Relay: ${relayHost}\n` +
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
