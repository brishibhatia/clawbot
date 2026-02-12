#!/bin/bash
# demo.sh — wrapper for the demo script (Unix)
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/demo.mjs
