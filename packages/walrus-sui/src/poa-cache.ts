import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';

const logger = pino({ name: 'deepclean-poa-cache' });

interface PoaCacheEntry {
    blobId: string;
    certifyTxDigest: string;
    availabilityEventRef: string;
    confirmationCertSha256: string;
    timestamp: number;
}

/**
 * Local cache mapping blobId → PoA data.
 * Avoids re-uploading blobs to get `alreadyCertified` response.
 *
 * Cache file: .deepclean/poa-cache.json
 */
export class PoaCache {
    private cachePath: string;
    private entries: Record<string, PoaCacheEntry> = {};

    constructor(baseDir: string = process.cwd()) {
        const deepcleanDir = path.join(baseDir, '.deepclean');
        if (!fs.existsSync(deepcleanDir)) {
            fs.mkdirSync(deepcleanDir, { recursive: true });
        }
        this.cachePath = path.join(deepcleanDir, 'poa-cache.json');
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(this.cachePath)) {
                this.entries = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
                logger.info({ count: Object.keys(this.entries).length }, 'Loaded PoA cache');
            }
        } catch (err) {
            logger.warn({ err }, 'Failed to load PoA cache, starting fresh');
            this.entries = {};
        }
    }

    private save() {
        try {
            fs.writeFileSync(this.cachePath, JSON.stringify(this.entries, null, 2));
        } catch (err) {
            logger.warn({ err }, 'Failed to save PoA cache');
        }
    }

    /**
     * Store PoA data for a blobId.
     */
    set(blobId: string, data: {
        certifyTxDigest: string;
        availabilityEventRef: string;
        confirmationCertSha256: string;
    }) {
        this.entries[blobId] = {
            blobId,
            ...data,
            timestamp: Date.now(),
        };
        this.save();
        logger.info({ blobId, certifyTxDigest: data.certifyTxDigest }, 'Cached PoA data');
    }

    /**
     * Get cached PoA data for a blobId.
     */
    get(blobId: string): PoaCacheEntry | null {
        return this.entries[blobId] ?? null;
    }

    /**
     * Check if we have cached PoA data for a blobId.
     */
    has(blobId: string): boolean {
        return blobId in this.entries;
    }
}
