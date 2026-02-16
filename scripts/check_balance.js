const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { SuiClient, getFullnodeUrl } = require('@mysten/sui/client');
const { fromBase64 } = require('@mysten/sui/utils');

async function main() {
    const key = process.env.SUI_PRIVATE_KEY;
    if (!key) throw new Error('No Key');
    
    // Check if key is hex or base64
    let secretKey;
    if (key.startsWith('0x') || key.length === 64) {
        // Hex
        secretKey = Buffer.from(key.replace(/^0x/, ''), 'hex');
    } else {
        // Base64
        secretKey = fromBase64(key);
    }
    
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    const address = keypair.getPublicKey().toSuiAddress();
    console.log(`Address: ${address}`);
    
    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    const balance = await client.getBalance({ owner: address });
    
    console.log(`Balance: ${balance.totalBalance} MIST`);
}

main().catch(console.error);
