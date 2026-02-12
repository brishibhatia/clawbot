# Threat Model — Verifiable DeepClean Butler

## Overview

DeepClean is a local agent with filesystem access that operates autonomously.
This document catalogs risks and the mitigations we apply.

---

## Risk 1: Accidental Data Loss

| | |
|---|---|
| **Threat** | Agent deletes or corrupts user files |
| **Severity** | Critical |
| **Mitigation** | **Non-destructive by default.** `policy.rules.neverDelete = true`. All "removal" actions move files to a quarantine directory with full path preserved. `restore` command can undo any quarantine action. |
| **Residual** | Quarantine dir could be manually deleted by user. Recommend backing up quarantine. |

## Risk 2: Secret Exfiltration

| | |
|---|---|
| **Threat** | Agent logs or uploads credentials, API keys, SSH keys |
| **Severity** | Critical |
| **Mitigation** | Agent never reads file contents beyond hashing (sha256 is one-way). Proof manifests contain only metadata (size, mtime, hash, path). Paths are redacted: hostname is replaced with `[host]`. `.env`, `.ssh`, `.gnupg` are in default skip patterns. |
| **Residual** | Custom skip patterns must be configured if secrets are stored in unusual locations. |

## Risk 3: Malicious File Execution

| | |
|---|---|
| **Threat** | Agent executes a suspicious file during unzip or classification |
| **Severity** | High |
| **Mitigation** | Classifier only reads file metadata (name, extension, size). Unzip uses system tools (`Expand-Archive`/`unzip`) with no execution. Suspicious files (double extensions, large executables) are quarantined, never executed. |
| **Residual** | ZIP bombs could consume disk space. Mitigated by `maxFileSizeMB` policy. |

## Risk 4: Proof Bundle Tampering

| | |
|---|---|
| **Threat** | Someone modifies the proof bundle after upload |
| **Severity** | Medium |
| **Mitigation** | Bundle sha256 is computed before upload and anchored on Sui (immutable). `verify` command downloads from Walrus and recomputes hash. Any tampering is detectable. |
| **Residual** | Sui object owner could potentially burn the object, but the transaction history remains on-chain as evidence. |

## Risk 5: Network-Based Attacks

| | |
|---|---|
| **Threat** | Man-in-the-middle on Walrus uploads or Sui transactions |
| **Severity** | Medium |
| **Mitigation** | All network communication uses HTTPS/TLS. Sui transactions are signed client-side with Ed25519. Hash integrity is verified end-to-end. |
| **Residual** | DNS poisoning could redirect to a fake relay. Users should verify relay URLs. |

## Risk 6: Excessive Resource Consumption

| | |
|---|---|
| **Threat** | Agent consumes too much CPU/disk/network |
| **Severity** | Low |
| **Mitigation** | `maxCpuPercent` config. `skipOnBattery` policy. Scheduler interval is configurable. Watcher uses debouncing (5s quiet period). |
| **Residual** | Very large directories could still cause temporary high I/O. |

## Risk 7: Private Key Exposure

| | |
|---|---|
| **Threat** | `SUI_PRIVATE_KEY` env var is leaked |
| **Severity** | High |
| **Mitigation** | Documented as **burner key only** in README. Never logged by pino (env vars are not included in logs). Key is only used for signing, never written to proof bundles. |
| **Residual** | Users must follow security hygiene for env vars. |

---

## Summary

| Risk | Severity | Status |
|------|----------|--------|
| Data loss | Critical | ✅ Mitigated (quarantine + restore) |
| Secret exfiltration | Critical | ✅ Mitigated (hash-only, skip patterns) |
| Malicious execution | High | ✅ Mitigated (no execution, quarantine) |
| Proof tampering | Medium | ✅ Mitigated (on-chain hash) |
| Network attacks | Medium | ✅ Mitigated (TLS, client-side signing) |
| Resource consumption | Low | ✅ Mitigated (config limits) |
| Key exposure | High | ⚠️ Partially mitigated (burner key guidance) |
