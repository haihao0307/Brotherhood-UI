#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "Python 3 was not found. Install Python and make sure python3 or python is available." >&2
  exit 1
fi

PYTHONUTF8=1 "$PYTHON_CMD" "$REPO_ROOT/brotherhood_control_runtime.py" "$@"
