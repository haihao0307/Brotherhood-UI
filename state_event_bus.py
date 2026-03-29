#!/usr/bin/env python3
"""Low-level event storage helpers for Brotherhood-UI state coordination."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4


ROOT_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = ROOT_DIR / ".runtime"
EVENTS_DIR = RUNTIME_DIR / "state-events"
STATE_FILE = ROOT_DIR / "state.json"
LOCK_FILE = RUNTIME_DIR / "state-coordinator.lock"

DEFAULT_STATE = {
    "state": "idle",
    "detail": "待命中",
    "hero": "宋江",
    "progress": 0,
    "source": "state_coordinator",
    "request_id": None,
    "sequence": 0,
    "event_id": None,
    "event_type": "bootstrap",
    "task_board_reason": "default_bootstrap",
    "ttl_seconds": 300,
    "updated_at": datetime.now().isoformat(),
}


def ensure_runtime_dirs() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def utc_now_iso() -> str:
    return datetime.now().isoformat()


def generate_request_id(prefix: str = "req") -> str:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return f"{prefix}_{stamp}_{uuid4().hex[:6]}"


def generate_event_id(prefix: str = "evt") -> str:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return f"{prefix}_{stamp}_{uuid4().hex[:8]}"


def event_filename(event_id: str, created_at: str) -> str:
    safe_stamp = (created_at or utc_now_iso()).replace(":", "").replace("-", "").replace(".", "_")
    return f"{safe_stamp}_{event_id}.json"


def append_event_record(event: dict[str, Any]) -> Path:
    ensure_runtime_dirs()
    event_id = str(event.get("id") or generate_event_id())
    created_at = str(event.get("created_at") or utc_now_iso())
    payload = dict(event)
    payload["id"] = event_id
    payload["created_at"] = created_at
    path = EVENTS_DIR / event_filename(event_id, created_at)
    write_json_atomic(path, payload)
    return path


def list_event_paths() -> list[Path]:
    ensure_runtime_dirs()
    return sorted((path for path in EVENTS_DIR.glob("*.json") if path.is_file()), key=lambda path: path.name)


def delete_event_paths(paths: list[Path]) -> None:
    for path in paths:
        try:
            if path.exists():
                path.unlink()
        except OSError:
            continue


def load_event_records() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in list_event_paths():
        payload = load_json(path)
        if isinstance(payload, dict):
            records.append(payload)
    return records


def load_state_snapshot() -> dict[str, Any]:
    payload = load_json(STATE_FILE)
    if isinstance(payload, dict):
        return payload
    return dict(DEFAULT_STATE)
