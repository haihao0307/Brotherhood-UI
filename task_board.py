#!/usr/bin/env python3
"""Convenience wrapper for driving the board through a task lifecycle."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

import route_task


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(ROOT_DIR, "state.json")


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "state": "idle",
        "detail": "待命中",
        "progress": 0,
        "updated_at": datetime.now().isoformat()
    }


def save_state(payload: dict) -> None:
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def apply_state(state: str, detail: str, hero: str | None = None, reason: str | None = None) -> dict:
    payload = load_state()
    payload["state"] = state
    payload["detail"] = detail
    payload["updated_at"] = datetime.now().isoformat()
    if hero:
        payload["hero"] = hero
    elif "hero" in payload:
        payload.pop("hero", None)
    if reason:
        payload["task_board_reason"] = reason
    save_state(payload)
    return payload


def command_start(task_text: str, rules_file: str) -> int:
    rules = route_task.parse_rules(rules_file)
    match = route_task.pick_rule(task_text, rules)
    if match:
        payload = route_task.build_state_payload(match, task_text)
        save_state(payload)
        print(f"start -> {payload['state']} ({payload.get('hero', '-')})")
        print(f"detail -> {payload['detail']}")
        print(f"rule -> {payload.get('routing_rule', '-')}")
        return 0

    payload = apply_state(
        state="researching",
        detail="宋江正在统筹局势，先梳理任务需求",
        hero="宋江",
        reason="route_fallback_researching"
    )
    payload["task_text"] = task_text
    save_state(payload)
    print("start -> researching (fallback)")
    print(f"detail -> {payload['detail']}")
    return 0


def command_done(detail: str) -> int:
    payload = apply_state(
        state="idle",
        detail=detail or "梁山暂且无事，待命中",
        hero="宋江",
        reason="task_completed"
    )
    print(f"done -> {payload['state']}")
    print(f"detail -> {payload['detail']}")
    return 0


def command_fail(detail: str) -> int:
    payload = apply_state(
        state="error",
        detail=detail or "鲁智深上场救火，正在处理异常",
        hero="鲁智深",
        reason="task_failed"
    )
    print(f"fail -> {payload['state']}")
    print(f"detail -> {payload['detail']}")
    return 0


def command_step(state: str, detail: str, hero: str | None) -> int:
    payload = apply_state(
        state=state,
        detail=detail or state,
        hero=hero,
        reason="manual_step"
    )
    print(f"step -> {payload['state']}")
    print(f"detail -> {payload['detail']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Drive Brotherhood-UI board states for a task lifecycle.")
    sub = parser.add_subparsers(dest="command", required=True)

    start_parser = sub.add_parser("start", help="Match a natural-language task and apply the routed state.")
    start_parser.add_argument("task", help="The task text from the user.")
    start_parser.add_argument("--rules", default=route_task.RULES_FILE, help="Markdown rules file path.")

    done_parser = sub.add_parser("done", help="Mark the task completed and return to idle.")
    done_parser.add_argument("detail", nargs="?", default="", help="Optional completion detail.")

    fail_parser = sub.add_parser("fail", help="Mark the task failed and switch to error.")
    fail_parser.add_argument("detail", nargs="?", default="", help="Optional failure detail.")

    step_parser = sub.add_parser("step", help="Manually set a state during task execution.")
    step_parser.add_argument("state", choices=sorted(route_task.VALID_STATES), help="Target state.")
    step_parser.add_argument("detail", nargs="?", default="", help="Optional detail text.")
    step_parser.add_argument("--hero", default=None, help="Optional hero label to write into state.json.")

    args = parser.parse_args()

    if args.command == "start":
        return command_start(args.task, args.rules)
    if args.command == "done":
        return command_done(args.detail)
    if args.command == "fail":
        return command_fail(args.detail)
    if args.command == "step":
        return command_step(args.state, args.detail, args.hero)
    return 1


if __name__ == "__main__":
    sys.exit(main())
