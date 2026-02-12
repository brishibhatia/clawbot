#!/bin/bash
# Publish the CleanupRun Move package to Sui testnet.
# Requires `sui` CLI to be installed and configured.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Publishing CleanupRun package to Sui testnet..."
echo "   Package dir: $PACKAGE_DIR"

sui client publish "$PACKAGE_DIR" \
  --gas-budget 100000000 \
  --skip-dependency-verification \
  --json | tee publish-result.json

echo ""
echo "✅ Published! Extract the package ID from publish-result.json"
echo "   Set DEEPCLEAN_PACKAGE_ID=<packageId> in your env"
