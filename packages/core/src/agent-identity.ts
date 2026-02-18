import fs from 'node:fs';
import path from 'node:path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, toBase64 } from '@mysten/sui/utils';

export class AgentIdentity {
    private keypair: Ed25519Keypair;
    public readonly agentId: string;

    constructor(private identityPath: string) {
        if (fs.existsSync(identityPath)) {
            const raw = fs.readFileSync(identityPath, 'utf-8').trim();
            this.keypair = Ed25519Keypair.fromSecretKey(raw);
        } else {
            this.keypair = new Ed25519Keypair();
            // Save secret key (bech32 'suiprivkey...' format ideally, but getSecretKey() returns string)
            const secret = this.keypair.getSecretKey();
            fs.writeFileSync(identityPath, secret, 'utf-8');
        }
        // Use Sui Address as Agent ID for now, or Public Key?
        // Let's use Public Key Base64 to be unambiguous.
        this.agentId = this.keypair.getPublicKey().toBase64();
    }

    public async sign(message: Uint8Array): Promise<Uint8Array> {
        // SDK's sign method returns Uint8Array signature (async)
        return this.keypair.sign(message);
    }
}
