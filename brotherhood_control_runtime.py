#!/usr/bin/env python3
"""Cross-platform Brotherhood-UI control runtime."""

from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any

from python_runtime import get_runtime_python_command


REPO_ROOT = Path(__file__).resolve().parent
RUNTIME_DIR = REPO_ROOT / ".runtime"
BACKEND_SCRIPT = REPO_ROOT / "backend" / "app.py"
WATCHER_SCRIPT = REPO_ROOT / "openclaw_session_watch.py"
BRIDGE_SCRIPT = REPO_ROOT / "openclaw_bridge.py"
DOCTOR_SCRIPT = REPO_ROOT / "openclaw_sync_doctor.py"
FRONTEND_REGRESSION_SCRIPT = REPO_ROOT / "frontend_regression_check.js"
ASSET_ACCEPTANCE_SCRIPT = REPO_ROOT / "asset_acceptance_check.py"
DEFAULT_BOARD_PORT = 18791
BOARD_PORT_FILE = RUNTIME_DIR / "board-port.txt"
BACKEND_PID_FILE = RUNTIME_DIR / "backend.pid"
WATCHER_PID_FILE = RUNTIME_DIR / "watcher.pid"
SYNC_STATUS_FILE = RUNTIME_DIR / "openclaw-sync-status.json"
IS_WINDOWS = os.name == "nt"


def ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def get_python_command(required_modules: tuple[str, ...] = ()) -> list[str]:
    return get_runtime_python_command(
        REPO_ROOT,
        preferred_python=sys.executable,
        required_modules=required_modules,
    )


def invoke_python_script(script_path: Path, script_args: list[str] | None = None) -> subprocess.CompletedProcess[str]:
    args = get_python_command() + [str(script_path)] + list(script_args or [])
    return subprocess.run(
        args,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1"},
    )


def invoke_node_script(script_path: Path, script_args: list[str] | None = None) -> subprocess.CompletedProcess[str]:
    args = ["node", str(script_path)] + list(script_args or [])
    return subprocess.run(
        args,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1"},
    )


def read_pid(path: Path) -> int | None:
    if not path.exists():
        return None
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except Exception:
        return None


def write_pid(path: Path, pid: int) -> None:
    ensure_runtime_dir()
    path.write_text(str(pid), encoding="utf-8")


def read_board_port() -> int:
    if BOARD_PORT_FILE.exists():
        try:
            value = int(BOARD_PORT_FILE.read_text(encoding="utf-8").strip())
            if 1 <= value <= 65535:
                return value
        except Exception:
            pass
    return DEFAULT_BOARD_PORT


def write_board_port(port: int) -> None:
    ensure_runtime_dir()
    BOARD_PORT_FILE.write_text(str(port), encoding="utf-8")


def remove_pid(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


def process_alive(pid: int) -> bool:
    try:
        if IS_WINDOWS:
            completed = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            return str(pid) in (completed.stdout or "")
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def stop_process(pid_file: Path, name: str) -> str:
    pid = read_pid(pid_file)
    if not pid:
        return f"{name} is not tracked by this helper."
    if not process_alive(pid):
        remove_pid(pid_file)
        return f"{name} is already stopped."
    try:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False, capture_output=True)
        else:
            os.killpg(pid, signal.SIGTERM)
    except Exception:
        try:
            if IS_WINDOWS:
                os.kill(pid, signal.SIGTERM)
            else:
                os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    remove_pid(pid_file)
    return f"{name} stopped."


def heartbeat_age_seconds() -> int | None:
    if not SYNC_STATUS_FILE.exists():
        return None
    try:
        payload = json.loads(SYNC_STATUS_FILE.read_text(encoding="utf-8"))
        heartbeat = payload.get("heartbeatAt")
        if heartbeat is None:
            return None
        return int(time.time() - float(heartbeat))
    except Exception:
        return None


def board_url_candidates(port: int | None = None) -> list[str]:
    board_port = port or read_board_port()
    candidates = [f"http://127.0.0.1:{board_port}"]
    try:
        hostname = socket.gethostname()
        for result in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = result[4][0]
            if ip.startswith("127.") or ip.startswith("169.254.") or ip == "0.0.0.0":
                continue
            url = f"http://{ip}:{board_port}"
            if url not in candidates:
                candidates.append(url)
    except Exception:
        pass
    return candidates


def _normalize_repo_root(path_value: str | Path | None) -> str | None:
    if not path_value:
        return None
    return str(Path(path_value).resolve()).casefold()


def board_matches_repo(payload: dict[str, Any], repo_root: Path = REPO_ROOT) -> bool:
    if payload.get("app") != "Brotherhood-UI" or payload.get("status") != "ok":
        return False
    return _normalize_repo_root(payload.get("repoRoot")) == _normalize_repo_root(repo_root)


def board_health_payload(url: str, timeout: int = 2) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=timeout) as response:
            if response.status < 200 or response.status >= 300:
                return None
            payload = json.loads(response.read().decode("utf-8"))
            if isinstance(payload, dict):
                return payload
            return None
    except Exception:
        return None


def board_healthy(url: str, timeout: int = 2) -> bool:
    payload = board_health_payload(url, timeout=timeout)
    return bool(payload and board_matches_repo(payload, REPO_ROOT))


def listening_pid_for_port(port: int) -> int | None:
    if IS_WINDOWS:
        completed = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        target = f":{port}"
        for line in (completed.stdout or "").splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            proto, local_address, _, state, pid_text = parts[:5]
            if proto.upper() != "TCP" or state.upper() != "LISTENING":
                continue
            if not local_address.endswith(target):
                continue
            try:
                return int(pid_text)
            except ValueError:
                return None
        return None

    completed = subprocess.run(
        ["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    pid_text = (completed.stdout or "").strip().splitlines()
    if not pid_text:
        return None
    try:
        return int(pid_text[0])
    except ValueError:
        return None


def stop_listening_backend_for_port(port: int) -> bool:
    pid = listening_pid_for_port(port)
    if not pid:
        return False
    if IS_WINDOWS:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False, capture_output=True)
    else:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            return False
    return True


def describe_process(pid: int) -> str:
    if IS_WINDOWS:
        completed = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        line = (completed.stdout or "").strip().splitlines()
        if line and line[0] and "No tasks are running" not in line[0]:
            parts = [part.strip('"') for part in line[0].split('","')]
            if parts and parts[0]:
                return f"{parts[0]} (PID {pid})"
    else:
        completed = subprocess.run(
            ["ps", "-p", str(pid), "-o", "comm="],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        name = (completed.stdout or "").strip()
        if name:
            return f"{name} (PID {pid})"
    return f"PID {pid}"


def port_available(port: int) -> bool:
    return listening_pid_for_port(port) is None


def choose_board_port(start_port: int = DEFAULT_BOARD_PORT, max_attempts: int = 20) -> int:
    for offset in range(max_attempts):
        candidate = start_port + offset
        if port_available(candidate):
            return candidate
    raise RuntimeError(f"No free port found starting from {start_port}.")


def resolve_board_url(wait_seconds: int = 0, port: int | None = None) -> str:
    candidates = board_url_candidates(port)
    deadline = time.time() + wait_seconds
    fallback = candidates[1] if len(candidates) > 1 else candidates[0]
    while True:
        for url in candidates:
            if board_healthy(url):
                return url
        if time.time() >= deadline:
            return fallback
        time.sleep(0.5)


def wait_for_repo_board(wait_seconds: int = 0, port: int | None = None) -> str | None:
    candidates = board_url_candidates(port)
    deadline = time.time() + wait_seconds
    while True:
        for url in candidates:
            if board_healthy(url):
                return url
        if time.time() >= deadline:
            return None
        time.sleep(0.5)


def resolve_local_board_url(wait_seconds: int = 0, port: int | None = None) -> str:
    board_port = port or read_board_port()
    candidates = board_url_candidates(board_port)
    if not candidates:
        return f"http://127.0.0.1:{board_port}"

    preferred = candidates[0]
    deadline = time.time() + wait_seconds
    fallback = candidates[1] if len(candidates) > 1 else preferred

    while True:
        if board_healthy(preferred):
            return preferred

        healthy_fallback = next((url for url in candidates[1:] if board_healthy(url)), None)
        if time.time() >= deadline:
            return healthy_fallback or fallback

        time.sleep(0.5)


def tail_runtime_log(log_path: Path, max_lines: int = 40) -> str:
    try:
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    return "\n".join(lines[-max_lines:])


def spawn_background(
    script_path: Path,
    log_path: Path,
    extra_args: list[str] | None = None,
    extra_env: dict[str, str] | None = None,
) -> int:
    ensure_runtime_dir()
    log_handle = open(log_path, "a", encoding="utf-8")
    kwargs: dict[str, Any] = {
        "cwd": str(REPO_ROOT),
        "stdout": log_handle,
        "stderr": subprocess.STDOUT,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
        "env": {**os.environ, "PYTHONUTF8": "1", **(extra_env or {})},
    }
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS  # type: ignore[attr-defined]
    else:
        kwargs["start_new_session"] = True
    required_modules = ("flask",) if script_path == BACKEND_SCRIPT else ()
    proc = subprocess.Popen(get_python_command(required_modules=required_modules) + [str(script_path)] + list(extra_args or []), **kwargs)
    return proc.pid


def start_backend() -> tuple[bool, str]:
    configured_port = read_board_port()
    existing_pid = read_pid(BACKEND_PID_FILE)
    current = resolve_board_url(1, port=configured_port)
    current_payload = board_health_payload(current)
    if current_payload and board_matches_repo(current_payload, REPO_ROOT):
        return True, f"Backend is already running.\nBoard URL: {current}"
    if current_payload and current_payload.get("app") == "Brotherhood-UI":
        stop_listening_backend_for_port(configured_port)
        time.sleep(1)
    selected_port = configured_port
    if listening_pid_for_port(configured_port):
        selected_port = choose_board_port(start_port=configured_port)
    restarted = False
    if existing_pid and process_alive(existing_pid):
        stop_process(BACKEND_PID_FILE, "Backend")
        restarted = True
    write_board_port(selected_port)
    pid = spawn_background(
        BACKEND_SCRIPT,
        RUNTIME_DIR / "backend.log",
        extra_env={"BROTHERHOOD_UI_PORT": str(selected_port)},
    )
    write_pid(BACKEND_PID_FILE, pid)
    url = wait_for_repo_board(6, port=selected_port)
    if not url:
        log_tail = tail_runtime_log(RUNTIME_DIR / "backend.log")
        detail = f"\n\nRecent backend log:\n{log_tail}" if log_tail else ""
        return False, f"Backend failed to start on port {selected_port}.{detail}"
    prefix = "Backend restarted." if restarted else "Backend started."
    return True, f"{prefix}\nBoard URL: http://127.0.0.1:{selected_port}"


def start_watcher() -> tuple[bool, str]:
    existing_pid = read_pid(WATCHER_PID_FILE)
    age = heartbeat_age_seconds()
    if existing_pid and process_alive(existing_pid) and age is not None and age < 15:
        return True, "OpenClaw watcher is already running."
    restarted = False
    if existing_pid and process_alive(existing_pid):
        stop_process(WATCHER_PID_FILE, "OpenClaw watcher")
        restarted = True
    pid = spawn_background(WATCHER_SCRIPT, RUNTIME_DIR / "watcher.log", ["--bootstrap-current"])
    write_pid(WATCHER_PID_FILE, pid)
    return True, "OpenClaw watcher restarted." if restarted else "OpenClaw watcher started."


def open_board() -> tuple[bool, str]:
    url = resolve_local_board_url(6)
    opened = webbrowser.open(url)
    if opened:
        return True, f"Opened browser: {url}"
    return True, f"Open this URL manually: {url}"


def run_doctor() -> tuple[bool, str]:
    completed = invoke_python_script(DOCTOR_SCRIPT)
    output = "\n".join(part for part in [(completed.stdout or "").strip(), (completed.stderr or "").strip()] if part)
    return completed.returncode == 0, output or "Doctor finished."


def run_regression() -> tuple[bool, str]:
    ok, backend_msg = start_backend()
    url = resolve_board_url(6)
    completed = invoke_node_script(
        FRONTEND_REGRESSION_SCRIPT,
        ["--url", url, "--screenshot-dir", str(REPO_ROOT / "output" / "web-game" / "regression")],
    )
    output_parts = [backend_msg.strip()] if backend_msg.strip() else []
    if (completed.stdout or "").strip():
        output_parts.append((completed.stdout or "").strip())
    if completed.returncode != 0 and (completed.stderr or "").strip():
        output_parts.append((completed.stderr or "").strip())
    return ok and completed.returncode == 0, "\n\n".join(output_parts) or "Regression finished."


def run_asset_acceptance() -> tuple[bool, str]:
    completed = invoke_python_script(ASSET_ACCEPTANCE_SCRIPT)
    output = "\n".join(part for part in [(completed.stdout or "").strip(), (completed.stderr or "").strip()] if part)
    return completed.returncode == 0, output or "Asset acceptance finished."


def stop_all() -> tuple[bool, str]:
    lines = [
        stop_process(WATCHER_PID_FILE, "OpenClaw watcher"),
        stop_process(BACKEND_PID_FILE, "Backend"),
    ]
    try:
        if SYNC_STATUS_FILE.exists():
            SYNC_STATUS_FILE.unlink()
    except OSError:
        pass
    return True, "\n".join(lines)


def run_bridge(action: str, rest: list[str]) -> tuple[bool, str]:
    completed = invoke_python_script(BRIDGE_SCRIPT, [action] + rest)
    output = "\n".join(part for part in [(completed.stdout or "").strip(), (completed.stderr or "").strip()] if part)
    return completed.returncode == 0, output or f"{action} finished."


def dispatch_action(action: str, rest: list[str] | None = None) -> tuple[bool, str]:
    args = list(rest or [])
    action = (action or "help").strip().lower()

    if action == "help":
        return True, (
            "Brotherhood-UI control runtime\n\n"
            "Actions:\n"
            "  serve  start backend\n"
            "  watch  start OpenClaw watcher\n"
            "  auto   start backend + watcher + open board\n"
            "  doctor inspect backend/watcher/session wiring\n"
            "  regression run fixed frontend behavior regression checks\n"
            "  asset-check run asset + docs + theme + regression acceptance\n"
            "  stop   stop managed backend and watcher\n"
            "  open   open board in browser\n"
            "  start/phase/done/fail/status  bridge lifecycle commands\n"
        )

    if action == "serve":
        return start_backend()
    if action == "watch":
        return start_watcher()
    if action == "auto":
        ok1, msg1 = start_backend()
        time.sleep(2)
        ok2, msg2 = start_watcher()
        time.sleep(1)
        ok3, msg3 = open_board()
        return ok1 and ok2 and ok3, "\n".join([msg1, msg2, msg3])
    if action == "doctor":
        return run_doctor()
    if action == "regression":
        return run_regression()
    if action == "asset-check":
        return run_asset_acceptance()
    if action == "stop":
        return stop_all()
    if action == "open":
        return open_board()
    if action in {"start", "phase", "done", "fail", "status"}:
        return run_bridge(action, args)
    return False, f"Unknown action: {action}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cross-platform Brotherhood-UI control runtime.")
    parser.add_argument("action", nargs="?", default="help")
    parser.add_argument("rest", nargs=argparse.REMAINDER)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    ok, output = dispatch_action(args.action, args.rest)
    if output:
        print(output)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
