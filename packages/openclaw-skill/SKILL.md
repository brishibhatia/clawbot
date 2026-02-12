---
name: deepclean
description: Verifiable workspace cleanup agent with tamper-evident Sui/Walrus proof bundles
metadata: {"author":"deepclean-team","track":"openclaw-track2-local-god-mode","license":"MIT"}
---

# DeepClean — OpenClaw Skill

An always-on local agent that proactively cleans and organizes workspaces
(Downloads, Desktop, repos) and produces tamper-evident proof bundles
anchored on Sui with data stored on Walrus.

## Permissions

| Permission | Scope | Reason |
|------------|-------|--------|
| `fs:read` | Configured roots only | Scan and classify files |
| `fs:write` | Configured roots + quarantine dir | Move/rename files, write proof bundles |
| `network:sui` | Sui testnet RPC | Anchor CleanupRun objects on-chain |
| `network:walrus` | Walrus testnet relay | Upload proof bundles |

> The agent never accesses files outside configured roots.
> It never deletes files — only quarantines (move to quarantine dir).
> It never exfiltrates secrets or logs credentials.

## Slash Commands

### `/deepclean plan`

Generate a dry-run cleanup plan without executing any actions.

```
/deepclean plan --path <dir> --policy <policy.json>
```

**What it does:**
1. Scans the target directory
2. Classifies every file (archive, media, code, doc, executable, unknown)
3. Detects suspicious files (double extensions, oversized executables)
4. Identifies duplicates by content hash
5. Outputs a human-readable action plan

**Example output:**
```
📋 Plan: 8 actions across 24 files
  🔒 [QUARANTINE] report.pdf.exe → Double extension detected
  🔗 [DEDUPE] copy_of_photo.jpg → Duplicate of photo.jpg
  📝 [RENAME] meeting notes.docx → 2025-01-15_meeting_notes.docx
  📦 [UNZIP] project.zip → Auto-unzip to staging
```

### `/deepclean run`

Execute the cleanup and generate a proof bundle.

```
/deepclean run --path <dir>
```

**What it does:**
1. Runs the plan (same as above)
2. Executes all actions (quarantine, dedupe, rename, unzip)
3. Captures before/after file tree snapshots
4. Generates a proof bundle ZIP with full manifest
5. Computes sha256 of the bundle

### `/deepclean status`

Show recent cleanup runs and their proof bundles.

```
/deepclean status
```

## Setup

The CLI is located at `{baseDir}/apps/deepclean-cli`. To use:

```bash
cd {baseDir}
pnpm install
pnpm build
node apps/deepclean-cli/dist/index.js plan --path .deepclean-demo
```

## Configuration

- `{baseDir}/deepclean.config.json` — roots, quarantine dir, schedule
- `{baseDir}/policy.json` — cleanup rules (never-delete, max size, etc.)
