#!/usr/bin/env python3
"""Single-writer state coordinator for Brotherhood-UI."""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from state_event_bus import (
    DEFAULT_STATE,
    LOCK_FILE,
    STATE_FILE,
    append_event_record,
    delete_event_paths,
    ensure_runtime_dirs,
    generate_event_id,
    generate_request_id,
    load_event_records,
    load_state_snapshot,
    list_event_paths,
    utc_now_iso,
    write_json_atomic,
)


SOURCE_PRIORITIES = {
    "openclaw_watch": 90,
    "openclaw_bridge": 80,
    "task_board": 70,
    "route_task": 60,
    "backend_api": 50,
    "set_state_manual": 40,
    "state_coordinator": 30,
}

WORKING_STATES = {"researching", "writing", "executing", "syncing"}
START_EVENT_TYPES = {"start", "manual_set", "api_set", "route_apply"}
TERMINAL_EVENT_TYPES = {"done", "fail", "auto_idle"}
MAX_EVENT_HISTORY = 400
KEEP_PER_REQUEST = 12


def _source_priority(source: str | None) -> int:
    return SOURCE_PRIORITIES.get(str(source or "").strip(), 0)


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


@contextmanager
def coordinator_lock(timeout_seconds: float = 10.0, poll_seconds: float = 0.05):
    ensure_runtime_dirs()
    deadline = time.time() + timeout_seconds
    acquired = False
    while time.time() < deadline:
        try:
            fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.close(fd)
            acquired = True
            break
        except FileExistsError:
            time.sleep(poll_seconds)
    if not acquired:
        raise TimeoutError("state coordinator lock timeout")

    try:
        yield
    finally:
        try:
            if os.path.exists(LOCK_FILE):
                os.unlink(LOCK_FILE)
        except OSError:
            pass


def ensure_bootstrap_state() -> dict[str, Any]:
    ensure_runtime_dirs()
    snapshot = load_state_snapshot()
    if os.path.exists(STATE_FILE):
        return snapshot
    write_json_atomic(STATE_FILE, snapshot)
    return snapshot


def _normalize_event(
    raw_event: dict[str, Any],
    snapshot: dict[str, Any],
    records: list[dict[str, Any]],
) -> dict[str, Any]:
    event = dict(raw_event or {})
    payload = dict(event.get("payload") or {})

    source = str(event.get("source") or "unknown").strip() or "unknown"
    event_type = str(event.get("event_type") or "phase").strip() or "phase"
    current_request_id = snapshot.get("request_id")
    if event_type in START_EVENT_TYPES:
        request_id = event.get("request_id") or generate_request_id()
        for stale_key in ("request_id", "sequence", "event_id", "event_type", "source"):
            payload.pop(stale_key, None)
    else:
        request_id = event.get("request_id") or payload.get("request_id") or current_request_id

    if request_id:
        request_id = str(request_id)

    existing_sequences = [
        _coerce_int(item.get("sequence"), 0)
        for item in records
        if str(item.get("request_id") or "") == str(request_id or "")
    ]
    current_sequence = _coerce_int(snapshot.get("sequence"), 0) if snapshot.get("request_id") == request_id else 0
    base_sequence = max(existing_sequences, default=current_sequence)
    explicit_sequence = event.get("sequence", payload.get("sequence"))
    if explicit_sequence is None:
        sequence = base_sequence + 1
    else:
        sequence = max(_coerce_int(explicit_sequence, base_sequence + 1), base_sequence + 1 if event_type in START_EVENT_TYPES and not existing_sequences else _coerce_int(explicit_sequence, base_sequence + 1))

    payload.setdefault("updated_at", utc_now_iso())
    if request_id and "request_id" not in payload:
        payload["request_id"] = request_id
    payload.setdefault("sequence", sequence)

    return {
        "id": str(event.get("id") or generate_event_id()),
        "source": source,
        "event_type": event_type,
        "request_id": request_id,
        "sequence": sequence,
        "created_at": str(event.get("created_at") or utc_now_iso()),
        "payload": payload,
        "reason": event.get("reason") or payload.get("task_board_reason"),
    }


def _should_apply_event(
    event: dict[str, Any],
    current_request_id: str | None,
    current_sequence: int,
    current_source: str,
    current_terminal: bool,
) -> bool:
    event_type = str(event.get("event_type") or "")
    event_request_id = event.get("request_id")
    event_sequence = _coerce_int(event.get("sequence"), 0)
    event_priority = _source_priority(event.get("source"))
    current_priority = _source_priority(current_source)

    if event_type in START_EVENT_TYPES:
        return True

    if current_request_id and event_request_id == current_request_id:
        if event_sequence > current_sequence:
            return True
        if event_sequence == current_sequence and event_priority >= current_priority:
            return True
        return False

    if current_request_id and event_request_id and event_request_id != current_request_id:
        return current_terminal

    if current_request_id and not event_request_id:
        return current_terminal or event_type == "auto_idle"

    if event_sequence > current_sequence:
        return True
    if event_sequence == current_sequence and event_priority >= current_priority:
        return True
    return False


def reduce_events(records: list[dict[str, Any]]) -> dict[str, Any]:
    snapshot = dict(DEFAULT_STATE)
    current_request_id = snapshot.get("request_id")
    current_sequence = _coerce_int(snapshot.get("sequence"), 0)
    current_source = str(snapshot.get("source") or "")
    current_terminal = False

    ordered = sorted(
        records,
        key=lambda item: (
            str(item.get("created_at") or ""),
            _coerce_int(item.get("sequence"), 0),
            str(item.get("id") or ""),
        ),
    )

    for event in ordered:
        if not isinstance(event, dict):
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        if not _should_apply_event(event, current_request_id, current_sequence, current_source, current_terminal):
            continue

        snapshot.update(payload)
        snapshot["source"] = str(event.get("source") or snapshot.get("source") or "unknown")
        snapshot["request_id"] = event.get("request_id")
        snapshot["sequence"] = _coerce_int(event.get("sequence"), snapshot.get("sequence", 0))
        snapshot["event_id"] = event.get("id")
        snapshot["event_type"] = str(event.get("event_type") or snapshot.get("event_type") or "phase")
        snapshot["updated_at"] = str(payload.get("updated_at") or event.get("created_at") or utc_now_iso())

        current_request_id = snapshot.get("request_id")
        current_sequence = _coerce_int(snapshot.get("sequence"), current_sequence)
        current_source = str(snapshot.get("source") or current_source)
        current_terminal = snapshot.get("event_type") in TERMINAL_EVENT_TYPES

    return snapshot


def prune_event_history(max_events: int = MAX_EVENT_HISTORY, keep_per_request: int = KEEP_PER_REQUEST) -> int:
    records = load_event_records()
    paths = list_event_paths()
    if len(paths) <= max_events:
        return 0

    ordered = list(zip(paths, records))
    keep_ids: set[str] = set()
    per_request_counts: dict[str, int] = {}

    for path, event in reversed(ordered):
        event_id = str(event.get("id") or "")
        if not event_id:
            continue
        request_id = str(event.get("request_id") or "")
        if len(keep_ids) < max_events:
            keep_ids.add(event_id)
        if request_id:
            count = per_request_counts.get(request_id, 0)
            if count < keep_per_request:
                keep_ids.add(event_id)
                per_request_counts[request_id] = count + 1

    delete_candidates = [path for path, event in ordered if str(event.get("id") or "") not in keep_ids]
    delete_event_paths(delete_candidates)
    return len(delete_candidates)


def refresh_state_snapshot() -> dict[str, Any]:
    with coordinator_lock():
        ensure_bootstrap_state()
        records = load_event_records()
        snapshot = reduce_events(records)
        write_json_atomic(STATE_FILE, snapshot)
        prune_event_history()
        return snapshot


def submit_event(raw_event: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    with coordinator_lock():
        snapshot = ensure_bootstrap_state()
        records = load_event_records()
        event = _normalize_event(raw_event, snapshot, records)
        append_event_record(event)
        records.append(event)
        reduced = reduce_events(records)
        write_json_atomic(STATE_FILE, reduced)
        prune_event_history()
        return event, reduced


def submit_snapshot_event(
    payload: dict[str, Any],
    *,
    source: str,
    event_type: str,
    request_id: str | None = None,
    sequence: int | None = None,
    reason: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    event: dict[str, Any] = {
        "source": source,
        "event_type": event_type,
        "payload": dict(payload or {}),
    }
    if request_id:
        event["request_id"] = request_id
    if sequence is not None:
        event["sequence"] = sequence
    if reason:
        event["reason"] = reason
    return submit_event(event)


def read_state_snapshot() -> dict[str, Any]:
    ensure_bootstrap_state()
    return load_state_snapshot()


def ensure_auto_idle(now: datetime | None = None) -> dict[str, Any]:
    with coordinator_lock():
        snapshot = ensure_bootstrap_state()
        state_name = str(snapshot.get("state") or "idle")
        if state_name not in WORKING_STATES:
            return snapshot

        updated_at = _parse_iso_datetime(str(snapshot.get("updated_at") or ""))
        if updated_at is None:
            return snapshot

        ttl_seconds = max(_coerce_int(snapshot.get("ttl_seconds"), 300), 1)
        compare_now = now or datetime.now(updated_at.tzinfo or timezone.utc)
        if updated_at.tzinfo is None:
            compare_now = now or datetime.now()
        age_seconds = (compare_now - updated_at).total_seconds()
        if age_seconds <= ttl_seconds:
            return snapshot

        payload = dict(snapshot)
        payload.update(
            {
                "state": "idle",
                "detail": "待命中（自動回到主場景）",
                "hero": "宋江",
                "progress": 0,
                "task_board_reason": "auto_idle_timeout",
                "updated_at": utc_now_iso(),
            }
        )
        event = _normalize_event(
            {
                "source": "state_coordinator",
                "event_type": "auto_idle",
                "request_id": snapshot.get("request_id"),
                "sequence": _coerce_int(snapshot.get("sequence"), 0) + 1,
                "payload": payload,
            },
            snapshot,
            load_event_records(),
        )
        append_event_record(event)
        records = load_event_records()
        reduced = reduce_events(records)
        write_json_atomic(STATE_FILE, reduced)
        prune_event_history()
        return reduced


if __name__ == "__main__":
    ensure_bootstrap_state()
    print(read_state_snapshot())
