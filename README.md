# Verifiable DeepClean Butler

> An AI-powered local agent that proactively cleans and organizes your workspace, producing tamper-evident proof bundles anchored on **Sui** with data stored on **Walrus**. Now with **Gemini AI** for semantic file classification.

**Track 2 — "Local God Mode"** | Mission: OpenClaw (Sui × OpenClaw)

---

## What It Does

DeepClean Butler is a local AI agent that keeps messy folders clean **and produces cryptographic proof** of what it did.

It watches configured directories (Downloads, Desktop, project folders) and:

1. **Automated cleanup**: scans and organizes files by classifying, renaming, deduplicating, and quarantining.
2. **Duplicate detection**: detects duplicates by content hash (SHA-256), quarantines duplicates, keeps the newest.
3. **Consistent naming**: renames files with a date-prefix + sanitized name (idempotent: skips if already prefixed).
4. **Suspicious-file quarantine**: quarantines risky patterns (double extensions like `invoice.pdf.exe`, oversized executables) — **never deletes**.
5. **Archive handling**: auto-unzips archives to a staging folder for safe inspection.
6. **Tamper-evident proof bundle**: generates a proof bundle per run (manifest, logs, file-tree diffs, AI summaries), zips it, and computes SHA-256.
7. **Walrus storage**: uploads the bundle to Walrus (decentralized blob storage).
8. **Sui anchoring**: anchors a `CleanupRun` object on Sui binding `walrus_blob_id` + `bundle_sha256` + metadata.

Anyone can verify a run by downloading the blob from a Walrus aggregator (`GET $AGGREGATOR/v1/blobs/<blobId>`) and checking the SHA-256 hash matches the on-chain `CleanupRun`.

---

## Why Sui/Walrus Are Essential

| Problem | Solution |
|---------|----------|
| "How do I prove this agent actually ran and didn't just fake results?" | Bundle sha256 is anchored on-chain — immutable, verifiable, with trusted on-chain timestamp via `sui::clock::Clock` |
| "What if someone tampers with the proof bundle after the fact?" | Download from Walrus + recompute hash + compare with Sui record |
| "Where do I store large proof artifacts durably?" | Walrus — decentralized blob storage with high availability; Walrus supports verifiable Proof of Availability (PoA) certificates anchored on Sui |
| "Can I audit the cleanup policy that was applied?" | Policy hash is stored on-chain alongside the run record |

---

## Key Uses & Use Cases

### Key Uses

1. **Automated workspace cleanup** — Scans messy directories and automatically classifies, renames, deduplicates, and quarantines files; non-destructive (no permanent deletes) with restore from quarantine.
2. **AI-powered file classification** — Optionally uses OpenAI (preferred) or Gemini to semantically classify text-based files (Invoice, Contract, Personal, Work, Code), going beyond extension-only rules.
3. **Tamper-evident proof of work** — Every run produces a SHA-256 hashed proof bundle that captures what actions happened and why, creating an auditable trail.
4. **On-chain anchoring (Sui + Walrus)** — The proof bundle is stored on Walrus while the immutable reference (bundle SHA-256, policy hash, metadata, timestamp) is anchored on Sui, enabling public verification.
5. **Public verification (no secrets)** — Any third party can verify a run with only a Sui Object ID: fetch the `CleanupRun` via `sui_getObject`, download the Walrus blob via `GET /v1/blobs/<blobId>`, recompute SHA-256, and compare. If `walrus_certify_tx` exists, PoA checking fetches tx details via `sui_getTransactionBlock` and verifies it succeeded.
6. **OpenClaw skill integration** — Exposes a programmatic API and a `/deepclean` skill workflow so other agents/tools can trigger runs.
7. **Always-on daemon mode** — Runs continuously in the background using directory watchers and scheduled runs.

### Real-World Use Cases

| Who | Use Case |
|-----|----------|
| **Developers** | Keep downloads and project folders clean, prevent accidental execution of suspicious files, maintain consistent naming |
| **Teams / Compliance** | Produce auditable cleanup evidence to show how sensitive files were handled (without deleting them) |
| **AI agent operators** | Prove an autonomous local agent actually performed the claimed actions, with cryptographic evidence |
| **Hackathon judges** | One-click verification that the system works end-to-end (Sui anchor + Walrus bundle download + hash match) |

> **Core value proposition:** an AI agent that cleans your files **and proves it did so honestly** with cryptographic evidence anchored on a public blockchain.

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

### Install & Demo

```bash
git clone https://github.com/brishibhatia/clawbot.git && cd clawbot
pnpm install
pnpm build
pnpm demo
```

To verify a run immediately (judges), run a demo, then `prove`, then `verify`:

```bash
pnpm demo
node apps/deepclean-cli/dist/index.js prove --run RUN_ID_HERE
node apps/deepclean-cli/dist/index.js verify --object SUI_OBJECT_ID_HERE --show-poa
```

Expected output:
```
── Verification Result ────────────────
   Hash Match:      ✅ YES
── Availability & PoA ─────────────────
   Availability (Walrus):  ✅ YES       ← blob downloadable from aggregator
   PoA (on-chain):         ✅ YES       ← certify tx verified on Sui
── PoA Details ────────────────────────
   walrus_certify_tx:        TX_DIGEST_HERE
   availability_event_ref:   TX_DIGEST:EVENT_SEQ   ← Sui event ID per Walrus docs
   confirmation_cert_sha256: HASH_OR_PUBLISHER_MODE
```

> **Note:** Publisher mode may show `PoA (on-chain): ⏳ PENDING` initially; use `--wait-poa` to poll until the publisher returns `alreadyCertified.event { txDigest, eventSeq }`. Relay mode certifies immediately.

The demo will:
1. Seed a messy workspace (`.deepclean-demo/`)
2. Run a dry-run plan
3. Execute cleanup
4. Generate proof bundle with sha256
5. Show status + quarantined files

### Two Upload Modes

| | Upload Relay | Publisher |
|---|---|---|
| **Endpoint** | `POST /v1/blob-upload-relay` | `PUT /v1/blobs?epochs=N` |
| **Cost** | Paid (relays expose `/v1/tip-config`; some accept `no_tip`) | Free |
| **PoA timing** | **Immediate** — relay returns `confirmation_certificate`, client certifies on Sui | **Async** — `alreadyCertified.event` appears later |
| **`walrus_certify_tx`** | Populated immediately | Empty until certified (`--wait-poa`) |
| **Best for** | Judge demos (guaranteed ✅) | Free uploads, background use |
| **CLI flag** | `--walrus-mode relay` | `--walrus-mode publisher` |

### CLI Commands

```bash
# Dry-run plan
node apps/deepclean-cli/dist/index.js plan --path .deepclean-demo

# Execute cleanup + proof bundle
node apps/deepclean-cli/dist/index.js run --path .deepclean-demo

# Upload to Walrus + anchor on Sui (auto-detects publisher vs relay)
node apps/deepclean-cli/dist/index.js prove --run RUN_ID_HERE

# Force relay mode for immediate on-chain PoA (best for judging demos)
node apps/deepclean-cli/dist/index.js prove --run RUN_ID_HERE --walrus-mode relay

# Force publisher mode (free, but PoA may be pending initially)
node apps/deepclean-cli/dist/index.js prove --run RUN_ID_HERE --walrus-mode publisher

# Verify (public, no secrets) — downloads via GET $AGGREGATOR/v1/blobs/BLOB_ID
# Also available via the web verifier at /verify/SUI_OBJECT_ID_HERE
node apps/deepclean-cli/dist/index.js verify --object SUI_OBJECT_ID_HERE

# Verify with full PoA details (certify tx, event ref, cert hash)
node apps/deepclean-cli/dist/index.js verify --object SUI_OBJECT_ID_HERE --show-poa

# Wait for on-chain PoA certification (polls publisher, 120s timeout)
node apps/deepclean-cli/dist/index.js verify --object SUI_OBJECT_ID_HERE --wait-poa --timeout 120

# List recent runs
node apps/deepclean-cli/dist/index.js status

# Restore quarantined files
node apps/deepclean-cli/dist/index.js restore --all
```

### 🏆 Judge Quick Path (Guaranteed PoA ✅)

```bash
# 1. Run cleanup + generate proof bundle
node apps/deepclean-cli/dist/index.js run --path .deepclean-demo

# 2. Prove with relay mode → immediate walrus_certify_tx
node apps/deepclean-cli/dist/index.js prove --run RUN_ID_HERE --walrus-mode relay

# 3. Verify → PoA (on-chain): ✅ YES
node apps/deepclean-cli/dist/index.js verify --object SUI_OBJECT_ID_HERE --show-poa
```

### Daemon (always-on mode)

```bash
node apps/deepclean-daemon/dist/index.js
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DeepClean Butler                        │
├──────────────┬──────────────┬───────────────────────────────┤
│  CLI         │  Daemon      │  OpenClaw Skill               │
│  (one-shot)  │  (watcher)   │  (/deepclean slash command)   │
├──────────────┴──────────────┴───────────────────────────────┤
│                    @deepclean/core                          │
│  ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │Classifier│ │Planner │ │Executor  │ │Proof Bundle      │ │
│  │+ Gemini  │ │        │ │(non-dest)│ │Builder           │ │
│  └──────────┘ └────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │Policy Engine     │ │Semantic AI   │ │Agent Identity  │  │
│  └──────────────────┘ └──────────────┘ └────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                 @deepclean/walrus-sui                       │
│  ┌──────────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │Walrus Client     │ │Sui Client    │ │Verify          │  │
│  │(upload relay)    │ │(anchor PTB)  │ │(download+hash) │  │
│  └──────────────────┘ └──────────────┘ └────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Sui Testnet                              │
│  cleanup_run::CleanupRun { run_id, walrus_blob_id,         │
│    bundle_sha256, policy_hash, plan_hash, agent_id,        │
│    walrus_certify_tx, walrus_availability_event_ref,       │
│    walrus_confirmation_cert_sha256, signature, ... }       │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
clawbot/
├── apps/
│   ├── deepclean-cli/                  # CLI application
│   │   ├── src/
│   │   │   ├── index.ts                #   Entry point (Commander setup)
│   │   │   └── commands/
│   │   │       ├── plan.ts             #   Dry-run scan
│   │   │       ├── run.ts              #   Execute cleanup + proof bundle
│   │   │       ├── prove.ts            #   Upload to Walrus + anchor on Sui
│   │   │       ├── verify.ts           #   Download + re-hash + check Sui
│   │   │       ├── status.ts           #   List recent runs
│   │   │       └── restore.ts          #   Restore quarantined files
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── deepclean-daemon/               # Always-on daemon
│       ├── src/
│       │   ├── index.ts                #   Entry point
│       │   ├── watcher.ts              #   Chokidar file watcher
│       │   └── scheduler.ts            #   Cron-like periodic runs
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── core/                           # Core engine library
│   │   ├── src/
│   │   │   ├── index.ts                #   Barrel exports
│   │   │   ├── types.ts                #   Shared types & interfaces
│   │   │   ├── classifier.ts           #   File classification (extension + AI)
│   │   │   ├── semantic-classifier.ts  #   AI semantic analysis (OpenAI / Gemini)
│   │   │   ├── policy-engine.ts        #   Rule evaluation from policy.json
│   │   │   ├── planner.ts              #   Directory scan → ActionPlan (rate-limited)
│   │   │   ├── executor.ts             #   Non-destructive action execution
│   │   │   ├── proof-bundle.ts         #   Manifest + ZIP + SHA-256
│   │   │   ├── agent-identity.ts       #   Ed25519 agent keypair management
│   │   │   ├── repo-hygiene.ts         #   Git repo detection & checks
│   │   │   └── seal.ts                 #   Seal encryption stub (AES-256-GCM)
│   │   ├── tests/
│   │   │   ├── classifier.test.ts
│   │   │   ├── policy-engine.test.ts
│   │   │   └── proof-bundle.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── walrus-sui/                     # Walrus + Sui integration
│   │   ├── src/
│   │   │   ├── index.ts                #   Barrel exports
│   │   │   ├── walrus-client.ts        #   HTTP upload to Walrus relay
│   │   │   ├── sui-client.ts           #   Sui PTB for CleanupRun anchoring
│   │   │   └── verify.ts              #   Download blob + re-hash + check Sui
│   │   ├── scripts/
│   │   │   └── publish.mjs             #   SDK-based contract publish script
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── openclaw-skill/                 # OpenClaw integration
│       ├── src/
│       │   ├── index.ts               #   DeepCleanSkill API wrapper
│       │   └── demo.ts                #   End-to-end integration test
│       ├── SKILL.md                    #   Skill metadata (YAML frontmatter)
│       └── deepclean.md                #   /deepclean slash command workflow
│
├── move/
│   └── cleanup_run/                    # Sui Move smart contract
│       ├── sources/
│       │   └── cleanup_run.move        #   CleanupRun struct + entry function
│       ├── scripts/
│       │   └── publish.sh              #   CLI publish helper
│       └── Move.toml                   #   Move package manifest
│
├── scripts/
│   ├── demo.mjs                        # End-to-end demo script
│   ├── demo.sh                         # Shell wrapper
│   ├── seed_workspace.mjs              # Creates messy demo workspace
│   ├── seed_workspace.sh               # Shell wrapper
│   ├── install_sui.ps1                 # Sui CLI installer (Windows)
│   ├── publish-sdk.mjs                 # Alternate publish via SDK
│   └── publish-sdk.ts                  # TypeScript publish script
│
├── docs/
│   ├── threat_model.md                 # Agent risks + mitigations
│   ├── judge_walkthrough.md            # Step-by-step verification for judges
│   └── examples/
│       ├── deepclean.config.json       # Example configuration
│       └── policy.json                 # Example policy
│
├── .env                                # Environment variables (git-ignored)
├── .gitignore
├── deepclean.config.json               # Default configuration
├── policy.json                         # Default cleanup policy
├── package.json                        # Root workspace package
├── pnpm-workspace.yaml                 # pnpm workspace declaration
├── pnpm-lock.yaml
├── tsconfig.base.json                  # Shared TypeScript config
└── README.md
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUI_NETWORK` | No | `testnet` | Sui network |
| `SUI_RPC_URL` | No | Auto from network | Custom RPC URL |
| `SUI_PRIVATE_KEY` | For prove | — | Base64 or `suiprivkey` format (**use burner key!**) |
| `DEEPCLEAN_PACKAGE_ID` | For prove | — | Published Move package ID |
| `WALRUS_UPLOAD_RELAY` | No | `https://upload-relay.testnet.walrus.space` | Walrus upload relay (for paid uploads) |
| `WALRUS_PUBLISHER_URL` | No | `https://publisher.walrus-testnet.walrus.space` | Walrus publisher (for free uploads) |
| `WALRUS_AGGREGATOR_URL` | No | `https://aggregator.walrus-testnet.walrus.space` | Walrus aggregator |
| `GEMINI_API_KEY` | No | — | Google Gemini API key for semantic AI classification (fallback if no OpenAI key) |
| `OPENAI_API_KEY` | No | — | OpenAI API key for semantic AI classification (preferred over Gemini) |

> ⚠️ **SUI_PRIVATE_KEY**: Use a burner testnet key only. Never use a mainnet key with real funds.
>
> 💡 **GEMINI_API_KEY**: Optional. If set, files are classified using AI. Free tier allows ~5 requests/min; the system auto-retries on rate limits.

---

## Safety Guarantees

- ✅ **Non-destructive**: No permanent deletes. All removals go to quarantine with `restore` command.
- ✅ **DRY_RUN mode**: `plan` command analyzes without executing. Daemon defaults to dry-run.
- ✅ **No secret exfiltration**: Only file metadata (name, size, hash) is used by default. If `OPENAI_API_KEY` or `GEMINI_API_KEY` is set, a small text snippet (first 2KB) of text-based files is sent for semantic classification.
- ✅ **Verifiable**: Every run produces a sha256-hashed proof bundle anchored on-chain.

---

## Advanced Security: "Local God Mode"

DeepClean Butler implements a **Local Agent Identity** model to prevent spoofing and ensure accountability.

1.  **Agent Identity**: Upon first run, the agent generates a local **Ed25519 keypair** stored in `.agent-identity`.
2.  **Run Signing**: Every proof bundle's SHA-256 hash is **signed** by this agent key.
3.  **On-Chain Verification**: The `CleanupRun` object on Sui stores the `agent_id` (public key) and the `signature`.
4.  **Client Verification**: When verifying a run, the client fetches the object from Sui and cryptographically verifies that the stored signature matches the bundle hash and agent ID.

This ensures that even if someone uploads a fake bundle to Walrus, they cannot anchor it on Sui without the agent's private key.

### Verification Command

To verify a run, you only need the **Sui Object ID**. The client downloads the blob from Walrus, re-hashing it, and checking the on-chain signature.

```bash
node apps/deepclean-cli/dist/index.js verify --object SUI_OBJECT_ID_HERE
```

Output:
```
   Verified: true
   Agent ID: TyTX8ADgpuh6JcKm9ySIhuiCrB329MNkw7XCfB2uK0o=
   Signature: 29,194,... (valid)
```

---

## Testing

```bash
pnpm test    # Unit tests (classifier, policy engine, proof bundle)
pnpm demo    # Integration test via demo script
```

---

## Move Contract

The `CleanupRun` struct:

```move
public struct CleanupRun has key, store {
    id: UID,
    run_id: String,
    walrus_blob_id: String,
    bundle_sha256: String,
    summary: String,
    timestamp_ms: u64,
    policy_hash: String,
    plan_hash: String,
    file_tree_root: String,
    action_count: u64,
    agent_id: String,
    signature: vector<u8>,
    walrus_certify_tx: String,                 // PoA: Sui tx digest for Walrus certify
    walrus_availability_event_ref: String,      // PoA: "txDigest:eventSeq"
    walrus_confirmation_cert_sha256: String,    // PoA: relay cert hash
    version: u8,
    owner: address,
}
```

The `timestamp_ms` field is derived on-chain from `sui::clock::Clock` (not client-provided), so it cannot be spoofed. The entry function signature includes all fields plus `clock: &Clock`.

> **Walrus security model:** With an upload relay, the client registers the blob on Sui and POSTs bytes to `/v1/blob-upload-relay`. The relay distributes slivers to storage nodes and returns a `confirmation_certificate` for on-chain certification. The `prove` command stores the PoA fields (`walrus_certify_tx`, `walrus_availability_event_ref`, `walrus_confirmation_cert_sha256`) on-chain. The `verify` command checks the certify tx exists, succeeded, and emitted the blob availability event.

> When calling `record_cleanup_run`, the contract uses `sui::clock::timestamp_ms(clock: &Clock)`; the `Clock` object is the singleton shared object at `0x6`. You must pass it by immutable reference.

Publish with:
```bash
cd move/cleanup_run
sui client publish --gas-budget 100000000
```

---

## Walrus Integration Details

### Endpoint Selection

DeepClean CLI auto-detects the upload mode by probing `/v1/tip-config`:
- **404 → Publisher**: Uploads via `PUT /v1/blobs?epochs=N` (free)
- **200 → Relay**: Pays tip on Sui, uploads via `POST /v1/blob-upload-relay` (paid)

### PoA Verification Semantics

| Check | What it proves | How |
|---|---|---|
| **Availability (Walrus)** | Blob is downloadable right now | `GET $AGGREGATOR/v1/blobs/BLOB_ID` |
| **PoA (on-chain)** | Walrus certified the blob on Sui | `walrus_certify_tx` exists, succeeded, emitted blob availability event |

PoA (on-chain) verification uses the **certified blob event** (or blob object status) on Sui; availability download is only an off-chain liveness check.

- **Relay mode**: Client receives `confirmation_certificate` → submits certify tx on Sui → `walrus_certify_tx` is immediate.
- **Publisher mode**: Certification is async. `alreadyCertified.event { txDigest, eventSeq }` appears when the publisher finds a previously certified blob. `--wait-poa` polls for this.
- **Event ref**: Stored as `txDigest:eventSeq` — the Sui event ID that can be used to find the transaction on the explorer or using a Sui SDK.
- **Cache**: Discovered PoA is persisted to `.deepclean/poa-cache.json` for instant future verification.

### Troubleshooting

```bash
# Check relay tip configuration
curl https://upload-relay.testnet.walrus.space/v1/tip-config
```

Public endpoints:
- Publisher (testnet): `https://publisher.walrus-testnet.walrus.space`
- Relay (testnet): `https://upload-relay.testnet.walrus.space`
- Aggregator (testnet): `https://aggregator.walrus-testnet.walrus.space`

The `prove` command handles tipping automatically and prints copy-paste friendly IDs:

```
walrus_blob_id=...
sui_object_id=...
tx_digest=...
```

---

## Semantic AI Classification 🧠

DeepClean Butler optionally uses **OpenAI GPT-4o-mini** (preferred) or **Google Gemini** to analyze file contents and provide intelligent classification beyond file extensions.

### How It Works

1. **Smart Classification**: Reads the first 2KB of text-based files and sends to the configured AI for analysis.
2. **Categories**: Returns one of `Invoice`, `Contract`, `Personal`, `Work`, `Code`, or `Unknown`.
3. **Auto-Summary**: Generates a 1-sentence summary stored in the proof bundle's `actions.jsonl`.
4. **Graceful Fallback**: If no API key is set or the API fails, falls back to extension-based classification.
5. **Rate Limiting**: Built-in retry logic with exponential backoff (5s → 10s → 20s) to handle API quotas.

### Enable It

Add one of these to `.env` (OpenAI is preferred when both are set):
```bash
OPENAI_API_KEY=sk-proj-...
# or
GEMINI_API_KEY=AIzaSy...
```

The classifier will automatically engage for text files (`.txt`, `.md`, `.json`, `.yaml`, `.py`, `.js`, `.ts`, etc.).

---

## OpenClaw Skill Integration

The `@deepclean/openclaw-skill` package provides a programmatic API for integration with the OpenClaw ecosystem:

```typescript
import { DeepCleanSkill } from '@deepclean/openclaw-skill';

const skill = new DeepCleanSkill();
const plan = await skill.plan('.deepclean-demo');
const result = await skill.run('.deepclean-demo');
await skill.prove(result);
const verified = await skill.verify(suiObjectId);
```

Run the integration test:
```bash
node packages/openclaw-skill/dist/demo.js
```

---

## Optional: Seal Encryption

The `@deepclean/core` package includes a `seal.ts` module with:
- Clean `ISealEncryptor` interface
- AES-256-GCM stub implementation
- Ready to swap in the real Seal client when available

---

## License

MIT
