import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────── */}
      <section className="hero container">
        <div className="hero-badge">🏆 Track 2 — Local God Mode</div>
        <h1>Verifiable AI Cleanup Agent</h1>
        <p className="hero-subtitle">
          DeepClean Butler proactively organizes your workspace, then anchors
          tamper-evident proof bundles on <strong>Sui</strong> with data stored
          on <strong>Walrus</strong>. Anyone can verify a run — no secrets, no
          local setup.
        </p>
        <div className="btn-group">
          <Link href="/verify" className="btn btn-primary">
            🔍 Verify a Run
          </Link>
          <a
            href="https://github.com/brishibhatia/clawbot"
            className="btn btn-secondary"
            target="_blank"
            rel="noopener"
          >
            View on GitHub ↗
          </a>
        </div>
      </section>

      {/* ── Feature Cards ────────────────────────── */}
      <section className="container">
        <div className="card-grid">
          <div className="card fade-in">
            <div className="card-icon">🛡️</div>
            <h3>Non-Destructive Cleanup</h3>
            <p>
              No permanent deletes — ever. Suspicious files go to quarantine with a
              one-click restore. Dry-run mode lets you preview before executing.
            </p>
          </div>
          <div className="card fade-in">
            <div className="card-icon">📦</div>
            <h3>Proof Bundle</h3>
            <p>
              Every run generates a SHA-256 hashed proof bundle (manifest, logs,
              file tree diffs) uploaded to Walrus decentralized storage.
            </p>
          </div>
          <div className="card fade-in">
            <div className="card-icon">✅</div>
            <h3>Public Verification</h3>
            <p>
              A <code>CleanupRun</code> object is anchored on Sui. Anyone can
              download the blob from Walrus, recompute the hash, and verify it
              matches the on-chain record.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────── */}
      <section className="container" style={{ paddingBottom: 40 }}>
        <div className="quick-path glow">
          <h3>🏆 Judge Quick Path</h3>
          <div className="quick-path-steps">
            <div className="quick-path-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <strong>Run cleanup</strong> —{" "}
                <code>node apps/deepclean-cli/dist/index.js run --path .deepclean-demo</code>
              </div>
            </div>
            <div className="quick-path-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <strong>Prove on-chain</strong> —{" "}
                <code>node apps/deepclean-cli/dist/index.js prove --run RUN_ID_HERE --walrus-mode relay</code>
              </div>
            </div>
            <div className="quick-path-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <strong>Verify publicly</strong> — paste the Sui Object ID on{" "}
                <Link href="/verify" style={{ color: "var(--accent-light)" }}>
                  the Verifier page
                </Link>{" "}
                or run{" "}
                <code>node apps/deepclean-cli/dist/index.js verify --object SUI_OBJECT_ID_HERE --show-poa</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Architecture ─────────────────────────── */}
      <section className="container" style={{ paddingBottom: 80 }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Architecture</h3>
          <pre style={{
            color: "var(--text-secondary)",
            fontSize: "0.82rem",
            lineHeight: 1.6,
            overflowX: "auto",
          }}>
            {`┌─────────────────────────────────────────────────────────────┐
│                     DeepClean Butler                        │
├──────────────┬──────────────┬───────────────────────────────┤
│  CLI         │  Daemon      │  OpenClaw Skill               │
│  (one-shot)  │  (watcher)   │  (/deepclean slash command)   │
├──────────────┴──────────────┴───────────────────────────────┤
│                     @deepclean/core                         │
│  Classifier · Planner · Executor · Proof Bundle · Agent ID  │
├─────────────────────────────────────────────────────────────┤
│                  @deepclean/walrus-sui                      │
│  Walrus Upload · Sui Anchor · Verify (download + hash)      │
├─────────────────────────────────────────────────────────────┤
│                       Sui Testnet                           │
│  CleanupRun { run_id, walrus_blob_id, bundle_sha256,        │
│    policy_hash, walrus_certify_tx, agent_id, signature }    │
└─────────────────────────────────────────────────────────────┘`}
          </pre>
        </div>
      </section>
    </main>
  );
}
