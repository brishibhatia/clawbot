/**
 * Seal Encryption Module — Interface + Stub
 *
 * Design: the interface is clean and ready for full Seal client integration.
 * The stub implementation uses AES-256-GCM as a placeholder so proof bundles
 * can still be encrypted/decrypted locally for development and demo purposes.
 *
 * TODO: Replace with actual Seal client when @aspect-build/seal-client is available.
 */

import crypto from 'node:crypto';
import type { SealEncryptionResult } from './types.js';

export interface ISealEncryptor {
    encrypt(data: Buffer): Promise<SealEncryptionResult>;
    decrypt(encrypted: Buffer, metadata: SealEncryptionResult['encryptionMetadata']): Promise<Buffer>;
}

/**
 * Stub Seal implementation using AES-256-GCM.
 * In production, this would call the Seal protocol for key management + encryption.
 */
export class SealStubEncryptor implements ISealEncryptor {
    private key: Buffer;

    constructor(key?: string) {
        // In production: key would come from Seal protocol
        this.key = key
            ? Buffer.from(key, 'hex')
            : crypto.randomBytes(32);
    }

    async encrypt(data: Buffer): Promise<SealEncryptionResult> {
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key, nonce);

        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        const tag = cipher.getAuthTag();

        return {
            encryptedData: Buffer.concat([tag, encrypted]),
            encryptionMetadata: {
                algorithm: 'aes-256-gcm',
                keyId: `stub-${this.key.subarray(0, 4).toString('hex')}`,
                nonce: nonce.toString('hex'),
                timestamp: new Date().toISOString(),
            },
        };
    }

    async decrypt(encrypted: Buffer, metadata: SealEncryptionResult['encryptionMetadata']): Promise<Buffer> {
        const nonce = Buffer.from(metadata.nonce, 'hex');
        const tag = encrypted.subarray(0, 16);
        const data = encrypted.subarray(16);

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, nonce);
        decipher.setAuthTag(tag);

        return Buffer.concat([decipher.update(data), decipher.final()]);
    }
}

/**
 * Factory: returns the current Seal encryptor (stub for now).
 * Swap this when real Seal SDK is ready.
 */
export function createSealEncryptor(key?: string): ISealEncryptor {
    // TODO: check for SEAL_* env vars and return real implementation
    return new SealStubEncryptor(key);
}
