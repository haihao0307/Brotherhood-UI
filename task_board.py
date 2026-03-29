#!/usr/bin/env python3
"""Convenience wrapper for driving the board through a task lifecycle."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from typing import Any

import route_task
from state_coordinator import read_state_snapshot, submit_snapshot_event


def configure_console_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(errors="replace")


def load_state() -> dict[str, Any]:
    return read_state_snapshot()


def _next_sequence(snapshot: dict[str, Any], request_id: str | None) -> int | None:
    if request_id and snapshot.get("request_id") == request_id:
        return int(snapshot.get("sequence") or 0) + 1
    if request_id:
        return 1
    return None


def save_state(
    payload: dict[str, Any],
    *,
    source: str = "task_board",
    event_type: str = "manual_set",
    request_id: str | None = None,
    sequence: int | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    _, snapshot = submit_snapshot_event(
        payload,
        source=source,
        event_type=event_type,
        request_id=request_id,
        sequence=sequence,
        reason=reason,
    )
    return snapshot


def apply_state(
    state: str,
    detail: str,
    hero: str | None = None,
    reason: str | None = None,
    *,
    source: str = "task_board",
    event_type: str = "manual_step",
    request_id: str | None = None,
    sequence: int | None = None,
) -> dict[str, Any]:
    snapshot = load_state()
    payload = dict(snapshot)
    payload["state"] = state
    payload["detail"] = detail
    payload["updated_at"] = datetime.now().isoformat()
    if hero:
        payload["hero"] = hero
    elif "hero" in payload:
        payload.pop("hero", None)
    if reason:
        payload["task_board_reason"] = reason
    resolved_request_id = request_id or snapshot.get("request_id")
    resolved_sequence = sequence if sequence is not None else _next_sequence(snapshot, resolved_request_id)
    return save_state(
        payload,
        source=source,
        event_type=event_type,
        request_id=resolved_request_id,
        sequence=resolved_sequence,
        reason=reason,
    )


def command_start(
    task_text: str,
    rules_file: str,
    request_id: str | None = None,
    source: str = "task_board",
) -> int:
    rules = route_task.parse_rules(rules_file)
    match = route_task.pick_rule(task_text, rules)
    if match:
        payload = route_task.build_state_payload(match, task_text)
        payload["task_board_reason"] = "task_started"
        snapshot = save_state(
            payload,
            source=source,
            event_type="start",
            request_id=request_id,
            sequence=1,
            reason="task_started",
        )
        print(f"start -> {snapshot['state']} ({snapshot.get('hero', '-')})")
        print(f"detail -> {snapshot['detail']}")
        print(f"rule -> {snapshot.get('routing_rule', '-')}")
        print(f"request -> {snapshot.get('request_id', '-')}")
        return 0

    snapshot = load_state()
    payload = dict(snapshot)
    payload.update(
        {
            "state": "researching",
            "detail": "宋江正在統籌局勢，先梳理任務需求",
            "hero": "宋江",
            "task_board_reason": "route_fallback_researching",
            "task_text": task_text,
            "updated_at": datetime.now().isoformat(),
        }
    )
    snapshot = save_state(
        payload,
        source=source,
        event_type="start",
        request_id=request_id,
        sequence=1,
        reason="route_fallback_researching",
    )
    print("start -> researching (fallback)")
    print(f"detail -> {snapshot['detail']}")
    print(f"request -> {snapshot.get('request_id', '-')}")
    return 0


def command_done(detail: str, request_id: str | None = None, source: str = "task_board") -> int:
    snapshot = load_state()
    active_request_id = request_id or snapshot.get("request_id")
    payload = apply_state(
        state="idle",
        detail=detail or "梁山暫且無事，待命中",
        hero="宋江",
        reason="task_completed",
        source=source,
        event_type="done",
        request_id=active_request_id,
        sequence=_next_sequence(snapshot, active_request_id),
    )
    print(f"done -> {payload['state']}")
    print(f"detail -> {payload['detail']}")
    return 0


def command_fail(detail: str, request_id: str | None = None, source: str = "task_board") -> int:
    snapshot = load_state()
    active_request_id = request_id or snapshot.get("request_id")
    payload = apply_state(
        state="error",
        detail=detail or "執行受阻，魯智深正在救火",
        hero="魯智深",
        reason="task_failed",
        source=source,
        event_type="fail",
        request_id=active_request_id,
        sequence=_next_sequence(snapshot, active_request_id),
    )
    print(f"fail -> {payload['state']}")
    print(f"detail -> {payload['detail']}")
    return 0


def command_step(
    state: str,
    detail: str,
    hero: str | None,
    request_id: str | None = None,
    source: str = "task_board",
) -> int:
    snapshot = load_state()
    active_request_id = request_id or snapshot.get("request_id")
    payload = apply_state(
        state=state,
        detail=detail or state,
        hero=hero,
        reason="manual_step",
        source=source,
        event_type="phase",
        request_id=active_request_id,
        sequence=_next_sequence(snapshot, active_request_id),
    )
    print(f"step -> {payload['state']}")
    print(f"detail -> {payload['detail']}")
    return 0


def main() -> int:
    configure_console_streams()
    parser = argparse.ArgumentParser(description="Drive Brotherhood-UI board states for a task lifecycle.")
    sub = parser.add_subparsers(dest="command", required=True)

    start_parser = sub.add_parser("start", help="Match a natural-language task and apply the routed state.")
    start_parser.add_argument("task", help="The task text from the user.")
    start_parser.add_argument("--rules", default=route_task.RULES_FILE, help="Markdown rules file path.")
    start_parser.add_argument("--request-id", default=None, help="Optional external request identifier.")

    done_parser = sub.add_parser("done", help="Mark the task completed and return to idle.")
    done_parser.add_argument("detail", nargs="?", default="", help="Optional completion detail.")
    done_parser.add_argument("--request-id", default=None, help="Optional external request identifier.")

    fail_parser = sub.add_parser("fail", help="Mark the task failed and switch to error.")
    fail_parser.add_argument("detail", nargs="?", default="", help="Optional failure detail.")
    fail_parser.add_argument("--request-id", default=None, help="Optional external request identifier.")

    step_parser = sub.add_parser("step", help="Manually set a state during task execution.")
    step_parser.add_argument("state", choices=sorted(route_task.VALID_STATES), help="Target state.")
    step_parser.add_argument("detail", nargs="?", default="", help="Optional detail text.")
    step_parser.add_argument("--hero", default=None, help="Optional hero label to write into state.json.")
    step_parser.add_argument("--request-id", default=None, help="Optional external request identifier.")

    args = parser.parse_args()

    if args.command == "start":
        return command_start(args.task, args.rules, args.request_id)
    if args.command == "done":
        return command_done(args.detail, args.request_id)
    if args.command == "fail":
        return command_fail(args.detail, args.request_id)
    if args.command == "step":
        return command_step(args.state, args.detail, args.hero, args.request_id)
    return 1


if __name__ == "__main__":
    sys.exit(main())
