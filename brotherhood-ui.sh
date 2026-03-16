#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$REPO_ROOT/.runtime"
BRIDGE_SCRIPT="$REPO_ROOT/openclaw_bridge.py"
BACKEND_SCRIPT="$REPO_ROOT/backend/app.py"
WATCHER_SCRIPT="$REPO_ROOT/openclaw_session_watch.py"
DOCTOR_SCRIPT="$REPO_ROOT/openclaw_sync_doctor.py"
BOARD_PORT=18791
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
WATCHER_PID_FILE="$RUNTIME_DIR/watcher.pid"
SYNC_STATUS_FILE="$RUNTIME_DIR/openclaw-sync-status.json"

ACTION="${1:-help}"
shift || true
ACTION_LOWER="$(printf '%s' "$ACTION" | tr '[:upper:]' '[:lower:]')"

get_python_command() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return
  fi
  if command -v python >/dev/null 2>&1; then
    echo "python"
    return
  fi
  echo "Python 3 was not found. Install Python and make sure python3 or python is available." >&2
  exit 1
}

PYTHON_CMD="$(get_python_command)"

invoke_python_script() {
  local script_path="$1"
  shift || true
  PYTHONUTF8=1 "$PYTHON_CMD" "$script_path" "$@"
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

get_pid_from_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 1
  fi
  tr -d '[:space:]' < "$path"
}

test_process_alive() {
  local process_id="$1"
  kill -0 "$process_id" >/dev/null 2>&1
}

write_pid_file() {
  local path="$1"
  local process_id="$2"
  ensure_runtime_dir
  printf '%s\n' "$process_id" > "$path"
}

remove_pid_file() {
  local path="$1"
  rm -f "$path"
}

get_sync_heartbeat_age_seconds() {
  if [[ ! -f "$SYNC_STATUS_FILE" ]]; then
    return 1
  fi
  PYTHONUTF8=1 "$PYTHON_CMD" - "$SYNC_STATUS_FILE" <<'PY'
import json
import sys
import time
from pathlib import Path

path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
    heartbeat = data.get("heartbeatAt")
    if heartbeat is None:
        raise ValueError
    print(int(time.time() - int(float(heartbeat))))
except Exception:
    raise SystemExit(1)
PY
}

resolve_board_url() {
  local wait_seconds="${1:-0}"
  PYTHONUTF8=1 "$PYTHON_CMD" - "$BOARD_PORT" "$wait_seconds" <<'PY'
import socket
import sys
import time
import urllib.request

port = int(sys.argv[1])
wait_seconds = int(sys.argv[2])
deadline = time.time() + wait_seconds

candidates = [f"http://127.0.0.1:{port}"]
try:
    hostname = socket.gethostname()
    for result in socket.getaddrinfo(hostname, None, socket.AF_INET):
        ip = result[4][0]
        if ip.startswith("127.") or ip.startswith("169.254.") or ip == "0.0.0.0":
            continue
        url = f"http://{ip}:{port}"
        if url not in candidates:
            candidates.append(url)
except Exception:
    pass

fallback = candidates[1] if len(candidates) > 1 else candidates[0]

def healthy(url: str) -> bool:
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=2) as response:
            if not (200 <= response.status < 300):
                return False
            payload = json.loads(response.read().decode("utf-8"))
            return payload.get("app") == "Brotherhood-UI" and payload.get("status") == "ok"
    except Exception:
        return False

while True:
    for candidate in candidates:
        if healthy(candidate):
            print(candidate)
            raise SystemExit(0)
    if time.time() >= deadline:
        print(fallback)
        raise SystemExit(0)
    time.sleep(0.5)
PY
}

show_usage() {
  cat <<'EOF'
Brotherhood-UI macOS/Linux helper

Usage:
  ./brotherhood-ui.sh serve
  ./brotherhood-ui.sh watch
  ./brotherhood-ui.sh auto
  ./brotherhood-ui.sh doctor
  ./brotherhood-ui.sh stop
  ./brotherhood-ui.sh open
  ./brotherhood-ui.sh start "Check the OpenClaw docs structure"
  ./brotherhood-ui.sh phase "Reading docs and organizing the plan"
  ./brotherhood-ui.sh phase "Implementing the frontend mapping logic" --state executing
  ./brotherhood-ui.sh done "Task completed, back to standby"
  ./brotherhood-ui.sh fail "Blocked, handling the error"
  ./brotherhood-ui.sh status
EOF
}

start_backend() {
  local preferred_url
  preferred_url="$(resolve_board_url 1)"
  if PYTHONUTF8=1 "$PYTHON_CMD" - "$preferred_url" <<'PY'
import json
import sys
import urllib.request
url = sys.argv[1].rstrip("/") + "/health"
try:
    with urllib.request.urlopen(url, timeout=2) as response:
        if not (200 <= response.status < 300):
            raise SystemExit(1)
        payload = json.loads(response.read().decode("utf-8"))
        raise SystemExit(0 if payload.get("app") == "Brotherhood-UI" and payload.get("status") == "ok" else 1)
except Exception:
    raise SystemExit(1)
PY
  then
    echo "Backend is already running."
    echo "Board URL: $preferred_url"
    return
  fi

  ensure_runtime_dir
  nohup env PYTHONUTF8=1 "$PYTHON_CMD" "$BACKEND_SCRIPT" > "$RUNTIME_DIR/backend.log" 2>&1 &
  write_pid_file "$BACKEND_PID_FILE" "$!"
  preferred_url="$(resolve_board_url 6)"
  echo "Backend started."
  echo "Board URL: $preferred_url"
}

start_watcher() {
  local existing_pid heartbeat_age
  if existing_pid="$(get_pid_from_file "$WATCHER_PID_FILE" 2>/dev/null)" && [[ -n "$existing_pid" ]]; then
    heartbeat_age="$(get_sync_heartbeat_age_seconds 2>/dev/null || true)"
    if test_process_alive "$existing_pid" && [[ -n "${heartbeat_age:-}" ]] && (( heartbeat_age < 15 )); then
      echo "OpenClaw watcher is already running."
      return
    fi
  fi

  ensure_runtime_dir
  nohup env PYTHONUTF8=1 "$PYTHON_CMD" "$WATCHER_SCRIPT" --bootstrap-current > "$RUNTIME_DIR/watcher.log" 2>&1 &
  write_pid_file "$WATCHER_PID_FILE" "$!"
  echo "OpenClaw watcher started."
}

stop_managed_process() {
  local pid_file="$1"
  local name="$2"
  local process_id
  if ! process_id="$(get_pid_from_file "$pid_file" 2>/dev/null)" || [[ -z "$process_id" ]]; then
    echo "$name is not tracked by this helper."
    return
  fi

  if test_process_alive "$process_id"; then
    kill "$process_id" >/dev/null 2>&1 || true
    echo "$name stopped."
  else
    echo "$name is already stopped."
  fi
  remove_pid_file "$pid_file"
}

open_board() {
  local preferred_url
  preferred_url="$(resolve_board_url 6)"
  if command -v open >/dev/null 2>&1; then
    open "$preferred_url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$preferred_url" >/dev/null 2>&1 &
  else
    echo "Open this URL manually: $preferred_url"
    return
  fi
  echo "Opened browser: $preferred_url"
}

case "$ACTION_LOWER" in
  help)
    show_usage
    ;;
  serve)
    start_backend
    ;;
  watch)
    start_watcher
    ;;
  auto)
    start_backend
    sleep 2
    start_watcher
    sleep 1
    open_board
    ;;
  doctor)
    invoke_python_script "$DOCTOR_SCRIPT"
    ;;
  stop)
    stop_managed_process "$WATCHER_PID_FILE" "OpenClaw watcher"
    stop_managed_process "$BACKEND_PID_FILE" "Backend"
    rm -f "$SYNC_STATUS_FILE"
    ;;
  open)
    open_board
    ;;
  start)
    if [[ $# -eq 0 ]]; then
      echo "start requires the original task text." >&2
      exit 1
    fi
    invoke_python_script "$BRIDGE_SCRIPT" start "$*"
    ;;
  phase)
    if [[ $# -eq 0 ]]; then
      echo "phase requires a work note." >&2
      exit 1
    fi
    invoke_python_script "$BRIDGE_SCRIPT" phase "$@"
    ;;
  done)
    if [[ $# -eq 0 ]]; then
      invoke_python_script "$BRIDGE_SCRIPT" done "Task completed, back to standby"
    else
      invoke_python_script "$BRIDGE_SCRIPT" done "$*"
    fi
    ;;
  fail)
    if [[ $# -eq 0 ]]; then
      invoke_python_script "$BRIDGE_SCRIPT" fail "Blocked, handling the error"
    else
      invoke_python_script "$BRIDGE_SCRIPT" fail "$*"
    fi
    ;;
  status)
    invoke_python_script "$DOCTOR_SCRIPT"
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    show_usage
    exit 1
    ;;
esac
