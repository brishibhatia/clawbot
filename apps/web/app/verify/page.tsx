"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface VerifyResult {
    valid: boolean;
    objectId: string;
    runId: string;
    walrusBlobId: string;
    expectedSha256: string;
    actualSha256: string;
    availabilityDownloadable: boolean;
    hashMatch: boolean;
    poaOnchainVerified: boolean;
    poaPending: boolean;
    walrusCertifyTx: string;
    walrusAvailabilityEventRef: string;
    walrusConfirmationCertSha256: string;
    blobUrl: string;
    agentId: string;
    policyHash: string;
    planHash: string;
    actionCount: string;
    timestampMs: string;
    latencyMs: number;
    error?: string;
}

const EXAMPLE_RUNS = [
    {
        label: "Run 1",
        id: "0x754dff8d6cccc1d66e6b3a0faea6e6229a79d7f8c7f23b4e8dedb36559c443e5",
    },
    {
        label: "Run 2",
        id: "0xd6b40a3b5b9343e19873675d69f40a4f41a3d77430dc852d1a5f6e63c0c96977",
    },
    {
        label: "Run 3",
        id: "0xd0bdc9a426f673152791de4914cbede5ac7461b46cbd8c85b24483524a4b17f4",
    },
];

function copyToClipboard(text: string, btn: HTMLButtonElement) {
    navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1200);
}

function CopyBtn({ text }: { text: string }) {
    return (
        <button
            className="copy-btn"
            onClick={(e) => copyToClipboard(text, e.currentTarget)}
        >
            Copy
        </button>
    );
}

function StatusBadge({ yes, label }: { yes: boolean | null; label?: string }) {
    if (yes === null) return <span className="status-badge pending">⏳ {label || "PENDING"}</span>;
    return yes
        ? <span className="status-badge yes">✅ {label || "YES"}</span>
        : <span className="status-badge no">❌ {label || "NO"}</span>;
}

function formatTimestamp(ms: string) {
    const n = Number(ms);
    if (!n) return "—";
    return new Date(n).toLocaleString();
}

export default function VerifyPage() {
    const router = useRouter();
    const [inputId, setInputId] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState("");

    const doVerify = useCallback(async (objectId: string) => {
        if (!objectId || !objectId.startsWith("0x")) {
            setError("Please enter a valid Sui Object ID (starts with 0x)");
            return;
        }
        setLoading(true);
        setResult(null);
        setError("");

        try {
            const res = await fetch(`/api/verify?objectId=${encodeURIComponent(objectId)}`);
            const json = await res.json();
            if (!res.ok) {
                setError(json.error || `Server error (${res.status})`);
            } else {
                setResult(json);
                // Update URL for shareability
                window.history.replaceState(null, "", `/verify/${objectId}`);
            }
        } catch {
            setError("Network error — could not reach verification server");
        } finally {
            setLoading(false);
        }
    }, []);

    // Check if URL has an objectId segment
    useEffect(() => {
        const path = window.location.pathname;
        const match = path.match(/\/verify\/(0x[a-fA-F0-9]+)/);
        if (match) {
            setInputId(match[1]);
            doVerify(match[1]);
        }
    }, [doVerify]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        doVerify(inputId);
    };

    const handleExample = (id: string) => {
        setInputId(id);
        doVerify(id);
    };

    return (
        <div className="verify-panel container">
            <h1>🔍 Verify a CleanupRun</h1>
            <p className="subtitle">
                Paste a Sui Object ID to independently verify the proof bundle.
                No secrets needed — reads are public.
            </p>

            <form onSubmit={handleSubmit}>
                <div className="input-group">
                    <input
                        type="text"
                        value={inputId}
                        onChange={(e) => setInputId(e.target.value)}
                        placeholder="0x754dff8d6cccc1d66e6b3a0f..."
                        spellCheck={false}
                        autoComplete="off"
                    />
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? <><span className="spinner" /> Verifying...</> : "Verify"}
                    </button>
                </div>
            </form>

            <div className="example-runs">
                <span>Try a sample:</span>
                {EXAMPLE_RUNS.map((ex) => (
                    <button
                        key={ex.id}
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleExample(ex.id)}
                        disabled={loading}
                    >
                        {ex.label}
                    </button>
                ))}
            </div>

            {/* ── Error ─────────────────────────────── */}
            {error && (
                <div className="verdict invalid fade-in">
                    ❌ {error}
                </div>
            )}

            {/* ── Loading ───────────────────────────── */}
            {loading && (
                <div className="verdict loading fade-in">
                    <span className="spinner" /> Fetching from Sui + Walrus…
                </div>
            )}

            {/* ── Result ────────────────────────────── */}
            {result && !loading && (
                <div className="fade-in">
                    {/* Verdict Banner */}
                    <div className={`verdict ${result.valid ? "valid" : "invalid"}`}>
                        {result.valid
                            ? "✅ Proof is valid — bundle hash matches on-chain record."
                            : "❌ Verification failed — hash mismatch or blob unavailable."}
                        <span style={{ marginLeft: "auto", fontSize: "0.82rem", opacity: 0.7 }}>
                            {result.latencyMs}ms
                        </span>
                    </div>

                    {/* Section 1: On-Chain Fields */}
                    <div className="card result-card" style={{ marginBottom: 16 }}>
                        <div className="result-header">
                            <span className="icon">⛓️</span> On-Chain Record (Sui)
                        </div>
                        <div className="result-body">
                            <div className="field-row">
                                <span className="field-label">Object ID</span>
                                <span className="field-value">{result.objectId}<CopyBtn text={result.objectId} /></span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Run ID</span>
                                <span className="field-value">{result.runId}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Walrus Blob ID</span>
                                <span className="field-value">{result.walrusBlobId}<CopyBtn text={result.walrusBlobId} /></span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Bundle SHA-256</span>
                                <span className="field-value">{result.expectedSha256}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Policy Hash</span>
                                <span className="field-value">{result.policyHash || "—"}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Plan Hash</span>
                                <span className="field-value">{result.planHash || "—"}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Agent ID</span>
                                <span className="field-value">{result.agentId || "—"}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Action Count</span>
                                <span className="field-value">{result.actionCount}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Timestamp</span>
                                <span className="field-value">{formatTimestamp(result.timestampMs)}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Sui Explorer</span>
                                <span className="field-value">
                                    <a
                                        href={`https://suiscan.xyz/testnet/object/${result.objectId}`}
                                        target="_blank"
                                        rel="noopener"
                                        style={{ color: "var(--accent-light)" }}
                                    >
                                        View on SuiScan ↗
                                    </a>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Walrus Download + Hash */}
                    <div className="card result-card" style={{ marginBottom: 16 }}>
                        <div className="result-header">
                            <span className="icon">📦</span> Walrus Download & Hash Verification
                        </div>
                        <div className="result-body">
                            <div className="field-row">
                                <span className="field-label">Availability (Walrus)</span>
                                <span className="field-value">
                                    <StatusBadge yes={result.availabilityDownloadable} label={result.availabilityDownloadable ? "YES" : "NO"} />
                                </span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Download URL</span>
                                <span className="field-value">
                                    <a href={result.blobUrl} target="_blank" rel="noopener" style={{ color: "var(--accent-light)", wordBreak: "break-all" }}>
                                        {result.blobUrl}
                                    </a>
                                    <CopyBtn text={result.blobUrl} />
                                </span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Expected SHA-256</span>
                                <span className="field-value">{result.expectedSha256}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Actual SHA-256</span>
                                <span className="field-value">{result.actualSha256 || "(download failed)"}</span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Hash Match</span>
                                <span className="field-value">
                                    <StatusBadge yes={result.hashMatch} label={result.hashMatch ? "YES" : "NO"} />
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: PoA Status */}
                    <div className="card result-card">
                        <div className="result-header">
                            <span className="icon">🔗</span> Proof of Availability (PoA)
                        </div>
                        <div className="result-body">
                            <div className="field-row">
                                <span className="field-label">PoA (on-chain)</span>
                                <span className="field-value">
                                    {result.poaOnchainVerified
                                        ? <StatusBadge yes={true} label="YES" />
                                        : result.poaPending
                                            ? <StatusBadge yes={null} label="PENDING" />
                                            : <StatusBadge yes={false} label="UNKNOWN" />
                                    }
                                </span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">walrus_certify_tx</span>
                                <span className="field-value">
                                    {result.walrusCertifyTx ? (
                                        <>
                                            {result.walrusCertifyTx}
                                            <CopyBtn text={result.walrusCertifyTx} />
                                        </>
                                    ) : "(pending)"}
                                </span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Event Ref</span>
                                <span className="field-value">
                                    {result.walrusAvailabilityEventRef || "(none)"}
                                </span>
                            </div>
                            <div className="field-row">
                                <span className="field-label">Cert SHA-256</span>
                                <span className="field-value">
                                    {result.walrusConfirmationCertSha256 || "(publisher mode)"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
