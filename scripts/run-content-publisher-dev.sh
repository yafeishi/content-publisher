#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -x ./scripts/start-xiaohongshu-mcp.sh ]]; then
  ./scripts/start-xiaohongshu-mcp.sh >/dev/null 2>&1 || true
fi

exec npm run dev
