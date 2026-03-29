#!/usr/bin/env python3
"""OpenClaw bridge for Brotherhood-UI lifecycle updates."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime

import route_task
import task_board


def configure_console_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(errors="replace")


def route_phase_note(note: str, rules_file: str) -> int:
    rules = route_task.parse_rules(rules_file)
    match = route_task.pick_rule(note, rules)
    if not match:
        payload = task_board.apply_state(
            state="researching",
            detail=note.strip() or "宋江正在统筹局势，先梳理任务需求",
            hero="宋江",
            reason="openclaw_phase_fallback",
        )
        print(json.dumps({"ok": True, "fallback": True, "payload": payload}, ensure_ascii=False, indent=2))
        return 0

    payload = route_task.build_state_payload(match, note)
    payload["detail"] = note.strip() or payload["detail"]
    payload["task_board_reason"] = "openclaw_phase_routed"
    payload["updated_at"] = datetime.now().isoformat()
    route_task.save_state(payload)
    print(json.dumps({"ok": True, "fallback": False, "payload": payload}, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    configure_console_streams()
    parser = argparse.ArgumentParser(
        description="Bridge OpenClaw task lifecycle events into Brotherhood-UI state.json."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    start_parser = sub.add_parser("start", help="Route the original user request into the board.")
    start_parser.add_argument("task", help="Original user request text.")
    start_parser.add_argument("--rules", default=route_task.RULES_FILE, help="Routing rules markdown path.")

    phase_parser = sub.add_parser("phase", help="Update the board for the current working phase.")
    phase_parser.add_argument("note", help="What OpenClaw is doing right now.")
    phase_parser.add_argument("--state", choices=sorted(route_task.VALID_STATES), help="Optional explicit state override.")
    phase_parser.add_argument("--hero", default=None, help="Optional explicit hero label.")
    phase_parser.add_argument("--rules", default=route_task.RULES_FILE, help="Routing rules markdown path.")

    done_parser = sub.add_parser("done", help="Mark the current task as completed.")
    done_parser.add_argument("detail", nargs="?", default="任务完成，梁山暂且无事", help="Optional completion detail.")

    fail_parser = sub.add_parser("fail", help="Mark the current task as failed or blocked.")
    fail_parser.add_argument("detail", nargs="?", default="执行受阻，鲁智深正在救火", help="Optional failure detail.")

    status_parser = sub.add_parser("status", help="Print the current board state.")
    status_parser.add_argument("--json", action="store_true", help="Print raw JSON.")

    args = parser.parse_args()

    if args.command == "start":
        return task_board.command_start(args.task, args.rules)

    if args.command == "phase":
        if args.state:
            detail = args.note.strip() or args.state
            return task_board.command_step(args.state, detail, args.hero)
        return route_phase_note(args.note, args.rules)

    if args.command == "done":
        return task_board.command_done(args.detail)

    if args.command == "fail":
        return task_board.command_fail(args.detail)

    if args.command == "status":
        payload = task_board.load_state()
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(f"{payload.get('state', 'idle')}: {payload.get('detail', '')}")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
