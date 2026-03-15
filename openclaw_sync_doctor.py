#!/usr/bin/env python3
"""Basic diagnostics for Brotherhood-UI local OpenClaw sync."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any


PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(PROJECT_ROOT, "state.json")
SYNC_STATUS_FILE = os.path.join(PROJECT_ROOT, ".runtime", "openclaw-sync-status.json")
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


def check_backend() -> tuple[bool, str]:
    for url in ("http://127.0.0.1:18791/health", "http://10.20.0.1:18791/health"):
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
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
        state = load_json(STATE_FILE)
        print(f"Board state: {state.get('state', 'unknown')} | {state.get('detail', '')}")
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
        print(f"Last bridge action: {sync_status.get('lastBridgeCommand', 'n/a')}")
        print(f"Last bridge value: {sync_status.get('lastBridgeValue', 'n/a')}")
        print(f"Last error: {sync_status.get('lastError', '') or 'none'}")
    else:
        print(f"Sync watcher: FAIL -> missing {SYNC_STATUS_FILE}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
