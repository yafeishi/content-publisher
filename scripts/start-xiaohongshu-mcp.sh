#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/xiaohongshu-mcp-runner.sh"
XHS_MCP_PORT="${XHS_MCP_PORT:-18060}"
XHS_LOG_DIR="${XHS_LOG_DIR:-$HOME/.xiaohongshu/logs}"
XHS_PROFILE_DIR="${XHS_PROFILE_DIR:-$HOME/.xiaohongshu/rod-profile-main}"
PID_FILE="$HOME/.xiaohongshu/mcp.pid"
LOG_FILE="$XHS_LOG_DIR/mcp.log"
MCP_URL="http://localhost:${XHS_MCP_PORT}/mcp"

mkdir -p "$XHS_LOG_DIR" "$HOME/.xiaohongshu"
chmod +x "$RUNNER"

if curl -s --max-time 3 -X POST "$MCP_URL" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"content-publisher","version":"1.0"}}}' \
  | rg -q '"jsonrpc":"2.0"'; then
  echo "xiaohongshu-mcp already healthy at $MCP_URL"
  exit 0
fi

nohup "$RUNNER" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

for _ in {1..12}; do
  sleep 1
  if curl -s --max-time 3 -X POST "$MCP_URL" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"content-publisher","version":"1.0"}}}' \
    | rg -q '"jsonrpc":"2.0"'; then
    echo "xiaohongshu-mcp started at $MCP_URL"
    echo "profile: $XHS_PROFILE_DIR"
    echo "log: $LOG_FILE"
    exit 0
  fi
done

echo "failed to start xiaohongshu-mcp, check log: $LOG_FILE" >&2
exit 1
