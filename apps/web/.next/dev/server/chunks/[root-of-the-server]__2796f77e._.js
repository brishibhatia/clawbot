module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/apps/web/app/api/verify/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
;
const SUI_RPC = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const WALRUS_AGG = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
async function suiGetObject(objectId) {
    const res = await fetch(SUI_RPC, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_getObject',
            params: [
                objectId,
                {
                    showContent: true,
                    showType: true
                }
            ]
        })
    });
    if (!res.ok) {
        throw Object.assign(new Error(`Sui RPC error: ${res.status}`), {
            status: 502
        });
    }
    const json = await res.json();
    if (json.error) {
        throw Object.assign(new Error(`Sui RPC: ${json.error.message}`), {
            status: 502
        });
    }
    const data = json.result?.data;
    if (!data?.content?.fields) {
        throw Object.assign(new Error('Object not found or has no content fields'), {
            status: 400
        });
    }
    const fields = data.content.fields;
    if (!fields.walrus_blob_id || !fields.bundle_sha256) {
        throw Object.assign(new Error('Object does not appear to be a CleanupRun (missing walrus_blob_id or bundle_sha256)'), {
            status: 400
        });
    }
    return fields;
}
async function downloadBlob(blobId) {
    const url = `${WALRUS_AGG}/v1/blobs/${blobId}`;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 30_000);
    try {
        const res = await fetch(url, {
            signal: controller.signal
        });
        if (!res.ok) {
            throw Object.assign(new Error(`Walrus download failed: ${res.status}`), {
                status: 504
            });
        }
        const arrayBuf = await res.arrayBuffer();
        return {
            data: Buffer.from(arrayBuf),
            url
        };
    } catch (err) {
        if (err.name === 'AbortError') {
            throw Object.assign(new Error('Walrus download timed out (30s)'), {
                status: 504
            });
        }
        throw err;
    } finally{
        clearTimeout(timeout);
    }
}
async function checkPoaTx(txDigest) {
    const res = await fetch(SUI_RPC, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'sui_getTransactionBlock',
            params: [
                txDigest,
                {
                    showEffects: true,
                    showEvents: true
                }
            ]
        })
    });
    if (!res.ok) return {
        verified: false
    };
    const json = await res.json();
    if (json.error) return {
        verified: false
    };
    const status = json.result?.effects?.status?.status;
    return {
        verified: status === 'success'
    };
}
async function GET(request) {
    const start = Date.now();
    const objectId = request.nextUrl.searchParams.get('objectId');
    if (!objectId || !objectId.startsWith('0x')) {
        return Response.json({
            error: 'Missing or invalid objectId query parameter (must start with 0x)'
        }, {
            status: 400
        });
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
            actualSha256 = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].createHash('sha256').update(data).digest('hex');
        } catch  {
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
            objectId,
            walrusBlobId,
            hashMatch,
            availabilityDownloadable,
            poaOnchainVerified,
            poaPending,
            latencyMs
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
            latencyMs
        });
    } catch (err) {
        const status = err.status || 500;
        return Response.json({
            error: err.message
        }, {
            status
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__2796f77e._.js.map