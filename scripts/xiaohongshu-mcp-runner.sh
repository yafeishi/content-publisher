#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

XHS_MCP_BIN="${XHS_MCP_BIN:-$HOME/.local/bin/xiaohongshu-mcp}"
XHS_MCP_PORT="${XHS_MCP_PORT:-18060}"
XHS_PROFILE_DIR="${XHS_PROFILE_DIR:-$HOME/.xiaohongshu/rod-profile-main}"
XHS_LOG_DIR="${XHS_LOG_DIR:-$HOME/.xiaohongshu/logs}"
XHS_PREFERENCES_PATH="$XHS_PROFILE_DIR/Default/Preferences"

mkdir -p "$XHS_PROFILE_DIR/Default" "$XHS_LOG_DIR"

if [[ ! -x "$XHS_MCP_BIN" ]]; then
  echo "xiaohongshu-mcp binary not found: $XHS_MCP_BIN" >&2
  exit 1
fi

if [[ -f "$XHS_PREFERENCES_PATH" ]]; then
  current_json="$(cat "$XHS_PREFERENCES_PATH" 2>/dev/null || echo '{}')"
else
  current_json='{}'
fi

merged_json="$(
  printf '%s' "$current_json" \
    | jq -c '
      .profile = (.profile // {}) |
      .profile.default_content_setting_values = (.profile.default_content_setting_values // {}) |
      .profile.default_content_setting_values.geolocation = 2
    '
)"

printf '%s' "$merged_json" > "$XHS_PREFERENCES_PATH"

exec "$XHS_MCP_BIN" -port ":$XHS_MCP_PORT" -rod "dir=$XHS_PROFILE_DIR"
