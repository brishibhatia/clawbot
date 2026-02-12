import fs from 'node:fs';
import pino from 'pino';

const logger = pino({ name: 'deepclean-walrus' });

const DEFAULT_UPLOAD_RELAY = 'https://upload-relay.testnet.walrus.space';
const DEFAULT_AGGREGATOR = 'https://aggregator.testnet.walrus.space';

export interface WalrusUploadResult {
    blobId: string;
    blobUrl: string;
}

/**
 * Upload a proof bundle zip to Walrus via the upload relay.
 * The relay handles storage node selection and tip management.
 */
export async function uploadToWalrus(zipPath: string): Promise<WalrusUploadResult> {
    const relayHost = process.env.WALRUS_UPLOAD_RELAY || DEFAULT_UPLOAD_RELAY;
    const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL || DEFAULT_AGGREGATOR;

    logger.info({ zipPath, relayHost }, 'Uploading proof bundle to Walrus');

    const fileData = fs.readFileSync(zipPath);
    const url = `${relayHost}/v1/blobs`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: fileData,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Walrus upload failed (${response.status}): ${text}`);
    }

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

/**
 * Download a blob from Walrus by blob ID.
 */
export async function downloadFromWalrus(blobId: string): Promise<Buffer> {
    const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL || DEFAULT_AGGREGATOR;
    const url = `${aggregatorUrl}/v1/blobs/${blobId}`;

    logger.info({ url }, 'Downloading from Walrus');

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Walrus download failed (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
