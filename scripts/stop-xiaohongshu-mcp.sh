#!/bin/zsh

set -euo pipefail

PID_FILE="$HOME/.xiaohongshu/mcp.pid"
LABEL="com.dang.content-publisher.xiaohongshu-mcp"

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist" >/dev/null 2>&1 || true
  echo "launchd service stopped: $LABEL"
fi

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" >/dev/null 2>&1; then
    kill "$PID" || true
    echo "stopped pid: $PID"
  fi
  rm -f "$PID_FILE"
fi

pkill -f "$HOME/.local/bin/xiaohongshu-mcp" >/dev/null 2>&1 || true
