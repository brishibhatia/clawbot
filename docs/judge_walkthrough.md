# Judge Walkthrough — Verifiable DeepClean Butler

Step-by-step verification guide for judges. Every claim is independently verifiable.

---

## Prerequisites

```bash
node --version    # ≥ 20.x
pnpm --version    # ≥ 9.x
```

---

## Step 1: Install & Build (~1 min)

```bash
cd clawbot
pnpm install
pnpm build
```

✅ Expected: All packages compile with 0 errors.

---

## Step 2: Run the Full Demo (~2 min)

```bash
pnpm demo
```

This will:
1. Seed a messy workspace at `.deepclean-demo/`
2. Run a **dry-run plan** (no files modified)
3. **Execute cleanup** (quarantine suspicious, dedupe, rename)
4. **Generate a proof bundle** ZIP + sha256
5. Show run **status**
6. List **quarantined files**

✅ Expected: You see emoji-annotated output for each step, ending with "Demo Complete!"

---

## Step 3: Verify the Proof Bundle

### 3a. Check the bundle exists

```bash
ls .deepclean-proofs/
```

You should see:
- `deepclean-proof-<runId>/` (directory with manifest, logs, file trees)
- `deepclean-proof-<runId>.zip` (the proof bundle)
- `deepclean-proof-<runId>-manifest.json` (the manifest)

### 3b. Verify the sha256 hash

**PowerShell:**
```powershell
$zip = Get-ChildItem .deepclean-proofs/*.zip | Select-Object -First 1
$hash = (Get-FileHash $zip.FullName -Algorithm SHA256).Hash.ToLower()
$manifest = Get-Content ($zip.FullName -replace '\.zip$', '-manifest.json') | ConvertFrom-Json
Write-Host "Computed: $hash"
Write-Host "Manifest: $($manifest.bundleSha256)"
Write-Host "Match:    $($hash -eq $manifest.bundleSha256)"
```

**Linux/macOS:**
```bash
ZIP=$(ls .deepclean-proofs/*.zip | head -1)
HASH=$(sha256sum "$ZIP" | cut -d' ' -f1)
MANIFEST_HASH=$(jq -r .bundleSha256 "${ZIP%.zip}-manifest.json")
echo "Computed: $HASH"
echo "Manifest: $MANIFEST_HASH"
[ "$HASH" = "$MANIFEST_HASH" ] && echo "✅ Match!" || echo "❌ Mismatch!"
```

✅ Expected: Hashes match. The sha256 uniquely identifies this exact bundle — verification recomputes it from the downloaded blob.

---

## Step 4: Inspect the Manifest

**PowerShell:**
```powershell
$m = Get-ChildItem .deepclean-proofs/*-manifest.json | Select-Object -First 1 | Get-Content | ConvertFrom-Json
Write-Host "Run ID:        $($m.runId)"
Write-Host "Policy:        v$($m.policyVersion) $($m.policyHash.Substring(0,12))..."
Write-Host "Actions:       $($m.executedActions.Count)"
Write-Host "Bundle SHA256: $($m.bundleSha256.Substring(0,16))..."
```

**Linux/macOS:**
```bash
MANIFEST=$(ls .deepclean-proofs/*-manifest.json | head -1)
jq '{runId, policyVersion, policyHash: .policyHash[:12], actions: (.executedActions | length), sha256: .bundleSha256[:16]}' "$MANIFEST"
```

✅ Expected: Manifest shows plan details, action results, before/after file counts.

---

## Step 5: Verify Quarantine

```bash
node apps/deepclean-cli/dist/index.js restore
```

✅ Expected: Lists quarantined files like `invoice.pdf.exe`, duplicates, etc.

---

## Step 6: On-Chain Verification (requires Sui testnet setup)

### 6a. Set environment variables

```bash
export SUI_PRIVATE_KEY="<your-burner-testnet-key>"
export DEEPCLEAN_PACKAGE_ID="<published-package-id>"
export SUI_NETWORK="testnet"
```

### 6b. Upload + Anchor

```bash
RUN_ID=$(jq -r .runId .deepclean-proofs/*-manifest.json | head -1)
node apps/deepclean-cli/dist/index.js prove --run "$RUN_ID"
```

✅ Expected: Copy-paste-friendly output block:
```
─── Copy-Paste IDs ─────────────────────────
walrus_blob_id=<blob_id>
sui_object_id=<object_id>
tx_digest=<digest>
─────────────────────────────────────────────
```

> The SDK automatically passes the shared `Clock` object (`0x6`) for trusted on-chain timestamps.

### 6c. Verify

```bash
node apps/deepclean-cli/dist/index.js verify --object <sui_object_id>
```

✅ Expected: Downloads from Walrus, recomputes sha256, confirms match with on-chain record.

### 6d. Check on Sui Explorer

Visit: `https://suiscan.xyz/testnet/object/<object_id>`

✅ Expected: `CleanupRun` object with fields: `run_id`, `walrus_blob_id`, `bundle_sha256`, `summary`, `timestamp_ms` (on-chain), `policy_hash`.

### 6e. Walrus Relay Troubleshooting

If the upload fails, check tip configuration:
```bash
curl https://upload-relay.testnet.walrus.space/v1/tip-config
```
The `prove` command checks this automatically. See [relay docs](https://docs.wal.app/operator-guide/upload-relay.html).

---

## Step 7: Unit Tests

```bash
pnpm test
```

✅ Expected: All tests pass (classifier, policy engine, proof bundle).

---

## Architecture Verification

| Component | What to check |
|-----------|---------------|
| Non-destructive | No `fs.unlinkSync` without copy-first in executor.ts |
| DRY_RUN mode | `plan` command never calls executor |
| No secret logging | grep for `password\|secret\|key` in pino calls → none |
| Proof integrity | sha256 computed AFTER zip, stored in manifest |
| On-chain anchor | Move module creates object, emits event, no return |
| Timestamp trust | `timestamp_ms` derived from `sui::clock::Clock`, not client-provided |
| Quarantine restore | `restore` command copies back + removes from quarantine |

---

## Time Budget

| Step | Time |
|------|------|
| Install + Build | ~1 min |
| Full Demo | ~1 min |
| Verify bundle locally | ~1 min |
| On-chain flow | ~2 min |
| **Total** | **< 5 min** |
