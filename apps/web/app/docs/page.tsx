import Link from "next/link";

export default function DocsPage() {
    return (
        <div className="docs container">
            <h1>Documentation & Security</h1>
            <p style={{ color: "var(--text-secondary)" }}>
                How DeepClean Butler works, what it guarantees, and how verification proves integrity.
            </p>

            {/* ── Safety Guarantees ─────────────────── */}
            <h2>Safety Guarantees</h2>
            <ul>
                <li><strong>Non-destructive:</strong> No permanent deletes. All removals go to quarantine with a <code>restore</code> command.</li>
                <li><strong>DRY_RUN mode:</strong> The <code>plan</code> command analyzes without executing. Daemon defaults to dry-run.</li>
                <li><strong>No secret exfiltration:</strong> Only file metadata (name, size, hash) is used by default. If <code>OPENAI_API_KEY</code> or <code>GEMINI_API_KEY</code> is set, a small text snippet (first 2KB) of text-based files is sent for semantic classification.</li>
                <li><strong>Verifiable:</strong> Every run produces a SHA-256 hashed proof bundle anchored on-chain.</li>
                <li><strong>Agent Identity:</strong> Each agent generates a local Ed25519 keypair. Every proof bundle is signed — the signature is stored on-chain for cryptographic verification.</li>
            </ul>

            {/* ── Threat Model ─────────────────────── */}
            <h2>Threat Model</h2>
            <h3>What DeepClean Proves</h3>
            <ul>
                <li>The agent ran a specific cleanup plan (deterministic plan hash)</li>
                <li>The proof bundle was generated and uploaded (Walrus blob ID)</li>
                <li>The bundle hash matches the on-chain record (SHA-256 integrity)</li>
                <li>The run was signed by a specific agent key (Ed25519 signature)</li>
                <li>The timestamp is Sui-clock-derived, not client-spoofable</li>
            </ul>

            <h3>What DeepClean Cannot Prove (Honest Limitations)</h3>
            <ul>
                <li>That the agent didn&apos;t skip files (policy completeness depends on trust in the policy config)</li>
                <li>That the local filesystem wasn&apos;t tampered with before the run</li>
                <li>Confidentiality of file contents (bundles are public on Walrus)</li>
            </ul>

            <div className="callout info">
                💡 The proof bundle contains metadata and file tree diffs — not the actual file contents.
                Only the SHA-256 hash is used for verification.
            </div>

            {/* ── How Verification Works ───────────── */}
            <h2>How Verification Works</h2>

            <p>The verifier performs 4 steps, all using public reads (no secrets):</p>

            <table className="docs-table">
                <thead>
                    <tr>
                        <th>Step</th>
                        <th>What happens</th>
                        <th>API used</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>1. Read Sui</strong></td>
                        <td>Fetch the <code>CleanupRun</code> object fields</td>
                        <td><code>sui_getObject</code></td>
                    </tr>
                    <tr>
                        <td><strong>2. Download</strong></td>
                        <td>Fetch proof bundle bytes from Walrus</td>
                        <td><code>GET /v1/blobs/BLOB_ID</code></td>
                    </tr>
                    <tr>
                        <td><strong>3. Hash</strong></td>
                        <td>Compute SHA-256 of downloaded bytes</td>
                        <td>Local computation</td>
                    </tr>
                    <tr>
                        <td><strong>4. PoA</strong></td>
                        <td>Check <code>walrus_certify_tx</code> succeeded on Sui</td>
                        <td><code>sui_getTransactionBlock</code></td>
                    </tr>
                </tbody>
            </table>

            <p>
                PoA (on-chain) verification uses the <strong>certified blob event</strong> (or blob object status) on Sui.
                Availability download is only an off-chain liveness check.
            </p>

            {/* ── Two Upload Modes ─────────────────── */}
            <h2>Walrus Upload Modes</h2>

            <table className="docs-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>Upload Relay</th>
                        <th>Publisher</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Endpoint</strong></td>
                        <td><code>POST /v1/blob-upload-relay</code></td>
                        <td><code>PUT /v1/blobs?epochs=N</code></td>
                    </tr>
                    <tr>
                        <td><strong>Cost</strong></td>
                        <td>Paid (relays expose <code>/v1/tip-config</code>)</td>
                        <td>Free</td>
                    </tr>
                    <tr>
                        <td><strong>PoA timing</strong></td>
                        <td><strong>Immediate</strong> — relay returns <code>confirmation_certificate</code>, client certifies on Sui</td>
                        <td><strong>Async</strong> — <code>alreadyCertified.event</code> appears later</td>
                    </tr>
                    <tr>
                        <td><strong>walrus_certify_tx</strong></td>
                        <td>Populated immediately</td>
                        <td>Empty until certified (<code>--wait-poa</code>)</td>
                    </tr>
                    <tr>
                        <td><strong>Best for</strong></td>
                        <td>Demos (guaranteed ✅)</td>
                        <td>Free uploads</td>
                    </tr>
                </tbody>
            </table>

            <div className="callout warning">
                ⚠️ Publisher mode may show <strong>PoA: PENDING</strong> initially.
                Use <code>--wait-poa</code> to poll until the publisher returns{" "}
                <code>alreadyCertified.event {"{"} txDigest, eventSeq {"}"}</code>.
                Relay mode certifies immediately.
            </div>

            <h3>Event Reference</h3>
            <p>
                When <code>alreadyCertified</code> is returned by the publisher, the event ref is stored as{" "}
                <code>txDigest:eventSeq</code> — the Sui event ID that can be used to find the transaction
                on the explorer or using a Sui SDK.
            </p>

            {/* ── AI Classification ────────────────── */}
            <h2>AI Classification (Optional)</h2>
            <p>
                DeepClean optionally uses <strong>OpenAI GPT-4o-mini</strong> (preferred) or <strong>Google Gemini</strong> for
                semantic file classification beyond file extensions.
            </p>
            <ul>
                <li>Reads only the first 2KB of text-based files</li>
                <li>Categories: Invoice, Contract, Personal, Work, Code, Unknown</li>
                <li>Graceful fallback: if no API key is set, uses extension-based classification</li>
                <li>AI summaries are included in the proof bundle&apos;s <code>actions.jsonl</code></li>
            </ul>

            <div className="callout info">
                🔒 AI classification is opt-in. Without an API key, only metadata and hashing are used —
                file contents are never read or transmitted.
            </div>

            {/* ── CTA ──────────────────────────────── */}
            <div style={{ marginTop: 48, textAlign: "center" }}>
                <Link href="/verify" className="btn btn-primary">
                    🔍 Try the Verifier
                </Link>
            </div>
        </div>
    );
}
