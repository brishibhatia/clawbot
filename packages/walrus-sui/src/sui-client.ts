import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import pino from 'pino';

const logger = pino({ name: 'deepclean-sui' });

export interface AnchorResult {
    txDigest: string;
    objectId: string;
}

/**
 * Restore keypair from env. Expects base64-encoded secret key.
 */
function getKeypair(): Ed25519Keypair {
    const key = process.env.SUI_PRIVATE_KEY;
    if (!key) {
        throw new Error('SUI_PRIVATE_KEY env var is required for Sui transactions');
    }
    // Support both raw base64 and suiprivkey format
    if (key.startsWith('suiprivkey')) {
        return Ed25519Keypair.fromSecretKey(key);
    }
    return Ed25519Keypair.fromSecretKey(fromBase64(key));
}

/**
 * Anchor a CleanupRun record on Sui by calling the Move entry function.
 */
export async function anchorOnSui(params: {
    packageId: string;
    runId: string;
    walrusBlobId: string;
    bundleSha256: string;
    summary: string;
    policyHash: string;
    planHash: string;
}): Promise<AnchorResult> {
    const network = (process.env.SUI_NETWORK as 'testnet' | 'mainnet') || 'testnet';
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(network);
    const client = new SuiClient({ url: rpcUrl });
    const keypair = getKeypair();

    logger.info({ packageId: params.packageId, runId: params.runId }, 'Anchoring CleanupRun on Sui');

    const tx = new Transaction();

    // SUI_CLOCK_OBJECT_ID = 0x6 — immutable shared object
    const SUI_CLOCK_OBJECT_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

    tx.moveCall({
        target: `${params.packageId}::cleanup_run::record_cleanup_run`,
        arguments: [
            tx.pure.string(params.runId),
            tx.pure.string(params.walrusBlobId),
            tx.pure.string(params.bundleSha256),
            tx.pure.string(params.summary),
            tx.pure.string(params.policyHash),
            tx.pure.string(params.planHash),
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
    });

    const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });

    const objectId =
        result.objectChanges?.find(
            (c) => c.type === 'created'
        )?.objectId ?? 'unknown';

    logger.info({ txDigest: result.digest, objectId }, 'CleanupRun anchored on Sui');

    return {
        txDigest: result.digest,
        objectId,
    };
}

/**
 * Fetch a CleanupRun object from Sui and return its fields.
 */
export async function fetchCleanupRun(objectId: string): Promise<Record<string, any>> {
    const network = (process.env.SUI_NETWORK as 'testnet' | 'mainnet') || 'testnet';
    const rpcUrl = process.env.SUI_RPC_URL || getFullnodeUrl(network);
    const client = new SuiClient({ url: rpcUrl });

    const obj = await client.getObject({
        id: objectId,
        options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== 'moveObject') {
        throw new Error(`Object ${objectId} is not a Move object`);
    }

    return (obj.data.content as any).fields;
}
