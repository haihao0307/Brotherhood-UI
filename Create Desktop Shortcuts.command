#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$HOME/Desktop"

mkdir -p "$DESKTOP_DIR"
ln -sfn "$SCRIPT_DIR/Brotherhood-UI Launcher.app" "$DESKTOP_DIR/Brotherhood-UI Launcher.app"

cat > "$DESKTOP_DIR/Brotherhood-UI Quick Start.txt" <<EOF
Brotherhood-UI launcher

1. Double-click "Brotherhood-UI Launcher.app"
2. Click "Start"
3. Keep using your local OpenClaw chat as normal
4. Click "Check" if the board does not move
5. Click "Stop" when you are done

Project folder:
$SCRIPT_DIR
EOF

echo "Desktop launcher and guide created."
