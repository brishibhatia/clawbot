# Verifiable DeepClean Butler

> An always-on local agent that proactively cleans and organizes your workspace, producing tamper-evident proof bundles anchored on **Sui** with data stored on **Walrus**.

**Track 2 — "Local God Mode"** | Mission: OpenClaw (Sui × OpenClaw)

---

## What It Does

DeepClean Butler watches your configured directories (Downloads, Desktop, project folders) and:

1. **Classifies** files: archives, media, code, documents, executables, unknown
2. **Detects duplicates** by content hash (sha256) — quarantines dupes, keeps newest
3. **Renames** files with date-prefix + sanitized name for consistency
4. **Quarantines** suspicious items (double extensions like `invoice.pdf.exe`, oversized executables) — **never deletes**
5. **Auto-unzips** archives to a staging folder
6. **Generates a proof bundle** for every run: JSON manifest + logs + file tree diffs, zipped and hashed
7. **Uploads the bundle to Walrus** (decentralized storage)
8. **Anchors a `CleanupRun` object on Sui** binding the Walrus blob ID + sha256 + metadata

Anyone can **verify** a run by downloading the blob from Walrus and checking the hash against the on-chain record.

---

## Why Sui/Walrus Are Essential

| Problem | Solution |
|---------|----------|
| "How do I prove this agent actually ran and didn't just fake results?" | Bundle sha256 is anchored on-chain — immutable, verifiable, with trusted on-chain timestamp via `sui::clock::Clock` |
| "What if someone tampers with the proof bundle after the fact?" | Download from Walrus + recompute hash + compare with Sui record |
| "Where do I store large proof artifacts durably?" | Walrus — decentralized blob storage with high availability; Walrus supports verifiable Proof of Availability (PoA) certificates anchored on Sui |
| "Can I audit the cleanup policy that was applied?" | Policy hash is stored on-chain alongside the run record |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

### Install & Demo

```bash
git clone <repo-url> clawbot && cd clawbot
pnpm install
pnpm build
pnpm demo
```

The demo will:
1. Seed a messy workspace (`.deepclean-demo/`)
2. Run a dry-run plan
3. Execute cleanup
4. Generate proof bundle with sha256
5. Show status + quarantined files

### CLI Commands

```bash
# Dry-run plan
node apps/deepclean-cli/dist/index.js plan --path .deepclean-demo

# Execute cleanup + proof bundle
node apps/deepclean-cli/dist/index.js run --path .deepclean-demo

# Upload to Walrus + anchor on Sui
node apps/deepclean-cli/dist/index.js prove --run <runId>

# Verify a run (download + re-hash + check Sui)
node apps/deepclean-cli/dist/index.js verify --object <suiObjectId>

# List recent runs
node apps/deepclean-cli/dist/index.js status

# Restore quarantined files
node apps/deepclean-cli/dist/index.js restore --all
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
│  │          │ │        │ │(non-dest)│ │Builder           │ │
│  └──────────┘ └────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │Policy Engine     │ │Repo Hygiene  │ │Seal (stub)     │  │
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
│    bundle_sha256, summary, timestamp, policy_hash }        │
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
│   │   │   ├── classifier.ts           #   File classification by extension
│   │   │   ├── policy-engine.ts        #   Rule evaluation from policy.json
│   │   │   ├── planner.ts              #   Directory scan → ActionPlan
│   │   │   ├── executor.ts             #   Non-destructive action execution
│   │   │   ├── proof-bundle.ts         #   Manifest + ZIP + SHA-256
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
| `WALRUS_UPLOAD_RELAY` | No | `https://upload-relay.testnet.walrus.space` | Walrus upload relay |
| `WALRUS_AGGREGATOR_URL` | No | `https://aggregator.testnet.walrus.space` | Walrus aggregator |

> ⚠️ **SUI_PRIVATE_KEY**: Use a burner testnet key only. Never use a mainnet key with real funds.

---

## Safety Guarantees

- ✅ **Non-destructive**: No permanent deletes. All removals go to quarantine with `restore` command.
- ✅ **DRY_RUN mode**: `plan` command analyzes without executing. Daemon defaults to dry-run.
- ✅ **No secret exfiltration**: Only file metadata (name, size, hash) is logged. Contents are never read beyond hashing.
- ✅ **Verifiable**: Every run produces a sha256-hashed proof bundle anchored on-chain.

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
    timestamp_ms: u64,      // Unix timestamp in milliseconds (sui::clock::Clock)
    policy_hash: String,
    owner: address,
}
```

The `timestamp_ms` field is derived on-chain from `sui::clock::Clock` (not client-provided), so it cannot be spoofed. The entry function signature is:

```move
entry fun record_cleanup_run(
    run_id: String, walrus_blob_id: String, bundle_sha256: String,
    summary: String, policy_hash: String, clock: &Clock, ctx: &mut TxContext,
)
```

> **Walrus security model:** The client uploads data to Walrus storage nodes, which gather a quorum of signed acknowledgements to form a write certificate. This certificate can be published on Sui as an onchain Proof of Availability (PoA). Our `prove` command stores the Walrus blob ID; a future enhancement can also store the PoA certificate reference.

> When calling `record_cleanup_run`, the transaction must pass the shared `Clock` object at address `0x6` by immutable reference for trusted on-chain timestamps.

Publish with:
```bash
cd move/cleanup_run
sui client publish --gas-budget 100000000
```

---

## Walrus Relay Troubleshooting

Walrus relays can require a tip; the relay advertises its policy at `/v1/tip-config` and accepts uploads at `/v1/blob-upload-relay`. If uploads fail, check the relay's tip configuration:

```bash
curl https://upload-relay.testnet.walrus.space/v1/tip-config
```

The `prove` command does this automatically and logs whether a tip is required. See [Walrus relay docs](https://docs.wal.app/operator-guide/upload-relay.html) for details.

---

## Optional: Seal Encryption

The `@deepclean/core` package includes a `seal.ts` module with:
- Clean `ISealEncryptor` interface
- AES-256-GCM stub implementation
- Ready to swap in the real Seal client when available

---

## License

MIT
