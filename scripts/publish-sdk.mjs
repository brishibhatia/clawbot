
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
function loadEnv() {
    try {
        const envPath = path.resolve('.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, value] = trimmed.split('=');
                if (key && value) {
                    process.env[key.trim()] = value.trim();
                }
            }
        }
    } catch (e) {
        console.error('Error loading .env', e);
    }
}

loadEnv();

async function main() {
    const key = process.env.SUI_PRIVATE_KEY;
    if (!key) {
        throw new Error('SUI_PRIVATE_KEY not found in .env');
    }

    let keypair;
    if (key.startsWith('suiprivkey')) {
        keypair = Ed25519Keypair.fromSecretKey(key);
    } else {
        keypair = Ed25519Keypair.fromSecretKey(fromBase64(key));
    }

    const client = new SuiClient({ url: getFullnodeUrl('testnet') });

    console.log(`Address: ${keypair.toSuiAddress()}`);

    // Read bytecode.json
    const bytecodeContent = fs.readFileSync('bytecode.json', 'utf8');
    const jsonLine = bytecodeContent.split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('{') && l.includes('"modules"'))
        .pop();

    if (!jsonLine) {
        throw new Error('Could not find JSON output in bytecode.json');
    }

    const { modules, dependencies } = JSON.parse(jsonLine);

    console.log(`Publishing ${modules.length} modules with ${dependencies.length} dependencies...`);

    const tx = new Transaction();
    const [upgradeCap] = tx.publish({
        modules,
        dependencies,
    });

    // Transfer upgrade cap to sender
    tx.transferObjects([upgradeCap], tx.pure.address(keypair.toSuiAddress()));

    const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });

    if (result.effects?.status.status !== 'success') {
        console.error('Publish failed:', result.effects?.status);
        process.exit(1);
    }

    const packageId = result.objectChanges?.find(c => c.type === 'published')?.packageId;
    
    console.log('✅ Published successfully!');
    console.log(`Package ID: ${packageId}`);
    
    // Output for processing
    console.log(`::PACKAGE_ID::${packageId}`);
}

main().catch(console.error);
