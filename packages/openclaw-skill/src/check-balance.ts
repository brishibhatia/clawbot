import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromBase64 } from '@mysten/sui/utils';

async function main() {
    const key = process.env.SUI_PRIVATE_KEY;
    if (!key) throw new Error('No Key');

    // Support suiprivkey bech32, hex, or base64 formats
    let keypair: Ed25519Keypair;
    if (key.startsWith('suiprivkey')) {
        keypair = Ed25519Keypair.fromSecretKey(key);
    } else if (key.startsWith('0x') || key.length === 64) {
        keypair = Ed25519Keypair.fromSecretKey(Buffer.from(key.replace(/^0x/, ''), 'hex'));
    } else {
        keypair = Ed25519Keypair.fromSecretKey(fromBase64(key));
    }
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(`Address: ${address}`);

    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    const balance = await client.getBalance({ owner: address });

    const balanceSui = Number(balance.totalBalance) / 1_000_000_000;
    console.log(`Balance: ${balanceSui} SUI`);
}

main().catch(console.error);
