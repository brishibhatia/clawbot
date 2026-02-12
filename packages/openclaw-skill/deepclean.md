---
description: Run DeepClean workspace cleanup with tamper-evident proof bundles
---

# /deepclean

## Usage

### Plan (dry-run analysis)
```bash
cd {baseDir}
node apps/deepclean-cli/dist/index.js plan --path <target_directory>
```

### Run (execute cleanup + generate proof bundle)
```bash
cd {baseDir}
node apps/deepclean-cli/dist/index.js run --path <target_directory>
```

### Prove (upload to Walrus + anchor on Sui)
```bash
cd {baseDir}
node apps/deepclean-cli/dist/index.js prove --run <run_id>
```

### Verify (download from Walrus + check Sui record)
```bash
cd {baseDir}
node apps/deepclean-cli/dist/index.js verify --object <sui_object_id>
```

### Status (list recent runs)
```bash
cd {baseDir}
node apps/deepclean-cli/dist/index.js status
```

### Restore (recover quarantined files)
```bash
cd {baseDir}
node apps/deepclean-cli/dist/index.js restore --all
```

## Steps

1. Read the user's request to determine which subcommand to run.
2. If the user wants to plan/analyze, use `plan --path <dir>`.
3. If the user wants to execute cleanup, use `run --path <dir>`.
4. If the user wants to prove a run on-chain, use `prove --run <id>`.
5. If the user wants to verify, use `verify --object <id>`.
6. Print the CLI output to the user in a human-friendly format.
7. If the command fails, check that `pnpm install && pnpm build` has been run first.
