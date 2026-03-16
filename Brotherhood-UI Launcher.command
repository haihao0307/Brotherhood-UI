#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PYTHONUTF8=1

if command -v python3 >/dev/null 2>&1; then
  python3 "$SCRIPT_DIR/brotherhood_ui_launcher.py"
elif command -v python >/dev/null 2>&1; then
  python "$SCRIPT_DIR/brotherhood_ui_launcher.py"
else
  osascript -e 'display dialog "Python 3 was not found. Install Python first." buttons {"OK"} default button "OK"'
fi
