import { NextRequest } from 'next/server';
import crypto from 'node:crypto';

const SUI_RPC = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const WALRUS_AGG = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';

interface CleanupRunFields {
    run_id: string;
    walrus_blob_id: string;
    bundle_sha256: string;
    summary: string;
    timestamp_ms: string;
    policy_hash: string;
    plan_hash: string;
    file_tree_root: string;
    action_count: string;
    agent_id: string;
    signature: number[];
    walrus_certify_tx: string;
    walrus_availability_event_ref: string;
    walrus_confirmation_cert_sha256: string;
    version: string;
}

async function suiGetObject(objectId: string): Promise<CleanupRunFields> {
    const res = await fetch(SUI_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_getObject',
            params: [objectId, { showContent: true, showType: true }],
        }),
    });

    if (!res.ok) {
        throw Object.assign(new Error(`Sui RPC error: ${res.status}`), { status: 502 });
    }

    const json = await res.json();
    if (json.error) {
        throw Object.assign(new Error(`Sui RPC: ${json.error.message}`), { status: 502 });
    }

    const data = json.result?.data;
    if (!data?.content?.fields) {
        throw Object.assign(new Error('Object not found or has no content fields'), { status: 400 });
    }

    const fields = data.content.fields;
    if (!fields.walrus_blob_id || !fields.bundle_sha256) {
        throw Object.assign(
            new Error('Object does not appear to be a CleanupRun (missing walrus_blob_id or bundle_sha256)'),
            { status: 400 },
        );
    }

    return fields as CleanupRunFields;
}

async function downloadBlob(blobId: string): Promise<{ data: Buffer; url: string }> {
    const url = `${WALRUS_AGG}/v1/blobs/${blobId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            throw Object.assign(new Error(`Walrus download failed: ${res.status}`), { status: 504 });
        }
        const arrayBuf = await res.arrayBuffer();
        return { data: Buffer.from(arrayBuf), url };
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw Object.assign(new Error('Walrus download timed out (30s)'), { status: 504 });
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function checkPoaTx(txDigest: string): Promise<{ verified: boolean }> {
    const res = await fetch(SUI_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'sui_getTransactionBlock',
            params: [txDigest, { showEffects: true, showEvents: true }],
        }),
    });

    if (!res.ok) return { verified: false };
    const json = await res.json();
    if (json.error) return { verified: false };

    const status = json.result?.effects?.status?.status;
    return { verified: status === 'success' };
}

export async function GET(request: NextRequest) {
    const start = Date.now();
    const objectId = request.nextUrl.searchParams.get('objectId');

    if (!objectId || !objectId.startsWith('0x')) {
        return Response.json(
            { error: 'Missing or invalid objectId query parameter (must start with 0x)' },
            { status: 400 },
        );
    }

    try {
        // Step 1: Fetch on-chain record
        const fields = await suiGetObject(objectId);

        const walrusBlobId = fields.walrus_blob_id;
        const expectedSha256 = fields.bundle_sha256;
        const walrusCertifyTx = fields.walrus_certify_tx || '';
        const walrusAvailabilityEventRef = fields.walrus_availability_event_ref || '';

        // Step 2: Download from Walrus
        let availabilityDownloadable = false;
        let actualSha256 = '';
        let blobUrl = `${WALRUS_AGG}/v1/blobs/${walrusBlobId}`;

        try {
            const { data, url } = await downloadBlob(walrusBlobId);
            blobUrl = url;
            availabilityDownloadable = data.length > 0;
            // Step 3: Hash
            actualSha256 = crypto.createHash('sha256').update(data).digest('hex');
        } catch {
            availabilityDownloadable = false;
        }

        const hashMatch = availabilityDownloadable && actualSha256 === expectedSha256;

        // Step 4: PoA check
        let poaOnchainVerified = false;
        let poaPending = !walrusCertifyTx;

        if (walrusCertifyTx) {
            const poaResult = await checkPoaTx(walrusCertifyTx);
            poaOnchainVerified = poaResult.verified;
        }

        const latencyMs = Date.now() - start;
        console.log(JSON.stringify({
            objectId, walrusBlobId, hashMatch, availabilityDownloadable,
            poaOnchainVerified, poaPending, latencyMs,
        }));

        return Response.json({
            valid: hashMatch,
            objectId,
            runId: fields.run_id,
            walrusBlobId,
            expectedSha256,
            actualSha256,
            availabilityDownloadable,
            hashMatch,
            poaOnchainVerified,
            poaPending,
            walrusCertifyTx,
            walrusAvailabilityEventRef,
            walrusConfirmationCertSha256: fields.walrus_confirmation_cert_sha256 || '',
            blobUrl,
            agentId: fields.agent_id || '',
            policyHash: fields.policy_hash || '',
            planHash: fields.plan_hash || '',
            actionCount: fields.action_count || '0',
            timestampMs: fields.timestamp_ms || '0',
            latencyMs,
        });
    } catch (err: any) {
        const status = err.status || 500;
        return Response.json({ error: err.message }, { status });
    }
}
