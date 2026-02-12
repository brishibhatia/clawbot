#!/bin/bash
# seed_workspace.sh — wrapper for the seed script (Unix)
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/seed_workspace.mjs
