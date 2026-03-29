#!/usr/bin/env python3
"""Basic diagnostics for Brotherhood-UI local OpenClaw sync."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from state_coordinator import read_state_snapshot


PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(PROJECT_ROOT, "state.json")
SYNC_STATUS_FILE = os.path.join(PROJECT_ROOT, ".runtime", "openclaw-sync-status.json")
DEFAULT_BOARD_PORT = 18791
BOARD_PORT_FILE = Path(PROJECT_ROOT) / ".runtime" / "board-port.txt"
DEFAULT_SESSIONS_JSON = os.path.join(
    os.path.expanduser("~"),
    ".openclaw",
    "agents",
    "main",
    "sessions",
    "sessions.json",
)


def configure_console_streams() -> None:
    import sys

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(errors="replace")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def read_board_port() -> int:
    try:
        value = int(BOARD_PORT_FILE.read_text(encoding="utf-8").strip())
        if 1 <= value <= 65535:
            return value
    except Exception:
        pass
    return DEFAULT_BOARD_PORT


def backend_url_candidates(port: int | None = None) -> list[str]:
    board_port = port or read_board_port()
    candidates = [f"http://127.0.0.1:{board_port}/health"]
    try:
        import socket

        hostname = socket.gethostname()
        for result in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = result[4][0]
            if ip.startswith("127.") or ip.startswith("169.254.") or ip == "0.0.0.0":
                continue
            url = f"http://{ip}:{board_port}/health"
            if url not in candidates:
                candidates.append(url)
    except Exception:
        pass
    return candidates


def check_backend() -> tuple[bool, str]:
    for url in backend_url_candidates():
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status != 200:
                    continue
                payload = json.load(response)
                if (
                    payload.get("app") == "Brotherhood-UI"
                    and payload.get("status") == "ok"
                    and str(Path(payload.get("repoRoot", "")).resolve()).casefold() == str(Path(PROJECT_ROOT).resolve()).casefold()
                ):
                    return True, url
        except urllib.error.URLError:
            continue
    return False, "backend unavailable"


def age_text(timestamp: float | None) -> str:
    if timestamp is None:
        return "n/a"
    delta = max(0, int(time.time() - timestamp))
    return f"{delta}s ago"


def main() -> int:
    configure_console_streams()
    ok, backend_info = check_backend()
    print("Brotherhood-UI Sync Doctor")
    print("=" * 32)
    print(f"Backend: {'OK' if ok else 'FAIL'} -> {backend_info}")

    if os.path.exists(STATE_FILE):
        state = read_state_snapshot()
        print(f"Board state: {state.get('state', 'unknown')} | {state.get('detail', '')}")
        print(f"State source: {state.get('source', '-')}")
        print(f"Request/seq: {state.get('request_id', '-')} / {state.get('sequence', '-')}")
    else:
        print("Board state: missing state.json")

    if os.path.exists(DEFAULT_SESSIONS_JSON):
        sessions = load_json(DEFAULT_SESSIONS_JSON)
        record = sessions.get("agent:main:main")
        if not isinstance(record, dict):
            newest_key = next(iter(sessions.keys()), None)
            record = sessions.get(newest_key) if newest_key else None
        if isinstance(record, dict):
            print(f"OpenClaw sessions.json: OK -> {DEFAULT_SESSIONS_JSON}")
            print(f"Active session file: {record.get('sessionFile', 'unknown')}")
        else:
            print(f"OpenClaw sessions.json: WARN -> no usable session entry")
    else:
        print(f"OpenClaw sessions.json: FAIL -> {DEFAULT_SESSIONS_JSON}")

    if os.path.exists(SYNC_STATUS_FILE):
        sync_status = load_json(SYNC_STATUS_FILE)
        heartbeat_at = sync_status.get("heartbeatAt")
        started_at = sync_status.get("startedAt")
        stale = False
        if isinstance(heartbeat_at, (int, float)):
            stale = (time.time() - float(heartbeat_at)) > 15
        status_label = sync_status.get("status", "unknown")
        if stale:
            status_label = f"stale ({status_label})"
        print(f"Sync watcher: {status_label}")
        print(f"Watcher started: {age_text(started_at)}")
        print(f"Watcher heartbeat: {age_text(heartbeat_at)}")
        print(f"Active request: {sync_status.get('activeRequestId', 'n/a')}")
        print(f"Last bridge action: {sync_status.get('lastBridgeCommand', 'n/a')}")
        print(f"Last bridge value: {sync_status.get('lastBridgeValue', 'n/a')}")
        print(f"Last phase signature: {sync_status.get('lastPhaseSignature', 'n/a')}")
        print(f"Last phase time: {age_text(sync_status.get('lastPhaseAt'))}")
        print(f"Observed phases: {sync_status.get('observedPhaseCount', 'n/a')}")
        print(f"Pending tool calls: {sync_status.get('pendingToolCallCount', 'n/a')}")
        print(f"Last observed tool: {sync_status.get('lastObservedToolName', 'n/a')}")
        print(f"Last observed activity: {sync_status.get('lastObservedActivity', 'n/a')}")
        print(f"Activity source: {sync_status.get('lastObservedActivitySource', 'n/a')}")
        print(f"Protocol mode: {sync_status.get('protocolMode', 'n/a')}")
        print(f"Protocol command: {sync_status.get('lastProtocolCommand', 'n/a')}")
        print(f"Protocol version: {sync_status.get('protocolVersion', 'n/a')}")
        print(f"Protocol path: {sync_status.get('protocolPath', 'n/a')}")
        print(f"Ignored phase reason: {sync_status.get('lastIgnoredPhaseReason', 'n/a')}")
        print(f"Last error: {sync_status.get('lastError', '') or 'none'}")
    else:
        print(f"Sync watcher: FAIL -> missing {SYNC_STATUS_FILE}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
