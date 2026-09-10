#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

XHS_MCP_PORT="${XHS_MCP_PORT:-18060}"
MCP_URL="http://localhost:${XHS_MCP_PORT}/mcp"
LABEL="com.dang.content-publisher.xiaohongshu-mcp"
PID_FILE="$HOME/.xiaohongshu/mcp.pid"
LOG_FILE="$HOME/.xiaohongshu/logs/mcp.log"

echo "label: $LABEL"
echo "url:   $MCP_URL"

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  echo "launchd: loaded"
else
  echo "launchd: not loaded"
fi

if [[ -f "$PID_FILE" ]]; then
  echo "pid file: $(cat "$PID_FILE")"
else
  echo "pid file: missing"
fi

if curl -s --max-time 3 -X POST "$MCP_URL" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"content-publisher","version":"1.0"}}}' \
  | rg -q '"jsonrpc":"2.0"'; then
  echo "health: ok"
else
  echo "health: failed"
fi

if [[ -f "$LOG_FILE" ]]; then
  echo "--- recent log ---"
  tail -n 20 "$LOG_FILE"
fi
