#!/usr/bin/env python3
"""Route a user task into Brotherhood-UI board state using markdown rules."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
RULES_FILE = os.path.join(ROOT_DIR, "docs", "task-routing-rules.md")
STATE_FILE = os.path.join(ROOT_DIR, "state.json")
VALID_STATES = {"idle", "writing", "researching", "executing", "syncing", "error"}


@dataclass
class TaskRule:
    title: str
    hero: str
    state: str
    detail: str
    keywords: List[str]
    priority: int = 0


def normalize_text(text: str) -> str:
    text = (text or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def parse_keywords(raw: str) -> List[str]:
    parts = re.split(r"[，,、/|]+", raw)
    return [item.strip().lower() for item in parts if item.strip()]


def parse_rules(markdown_path: str) -> List[TaskRule]:
    if not os.path.exists(markdown_path):
        raise FileNotFoundError(f"rules file not found: {markdown_path}")

    with open(markdown_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    rules: List[TaskRule] = []
    current_title: Optional[str] = None
    current_data: dict = {}

    def flush_rule() -> None:
        nonlocal current_title, current_data
        if not current_title:
            current_data = {}
            return

        state = str(current_data.get("state", "")).strip().lower()
        if state not in VALID_STATES:
            raise ValueError(f"invalid state in rule '{current_title}': {state}")

        detail = str(current_data.get("detail", "")).strip()
        keywords = parse_keywords(str(current_data.get("keywords", "")))
        hero = str(current_data.get("hero", "")).strip()
        priority = int(str(current_data.get("priority", "0")).strip() or "0")

        if not hero:
            raise ValueError(f"missing hero in rule '{current_title}'")
        if not detail:
            raise ValueError(f"missing detail in rule '{current_title}'")
        if not keywords:
            raise ValueError(f"missing keywords in rule '{current_title}'")

        rules.append(TaskRule(
            title=current_title.strip(),
            hero=hero,
            state=state,
            detail=detail,
            keywords=keywords,
            priority=priority
        ))
        current_title = None
        current_data = {}

    for raw_line in lines:
        line = raw_line.rstrip("\n")
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("## "):
            flush_rule()
            current_title = stripped[3:].strip()
            current_data = {}
            continue
        if stripped.startswith("- ") and ":" in stripped:
            key, value = stripped[2:].split(":", 1)
            current_data[key.strip().lower()] = value.strip()

    flush_rule()
    return rules


def filter_overlapping_keywords(matched: List[str]) -> List[str]:
    """Prefer longer matched phrases so nested short keywords do not score twice."""
    kept: List[str] = []
    for keyword in sorted(matched, key=len, reverse=True):
        if any(keyword in existing for existing in kept):
            continue
        kept.append(keyword)
    return sorted(kept, key=lambda item: (-len(item), item))


def pick_rule(task_text: str, rules: List[TaskRule]) -> Optional[dict]:
    normalized = normalize_text(task_text)
    if not normalized:
        return None

    best = None
    for rule in rules:
        matched = [kw for kw in rule.keywords if kw and kw in normalized]
        matched = filter_overlapping_keywords(matched)
        if not matched:
            continue
        score = len(matched) * 1000 + sum(len(kw) for kw in matched) + rule.priority * 10
        candidate = {
            "rule": rule,
            "matched_keywords": matched,
            "score": score
        }
        if best is None or candidate["score"] > best["score"]:
            best = candidate
    return best


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "state": "idle",
        "detail": "待命中",
        "updated_at": datetime.now().isoformat()
    }


def save_state(payload: dict) -> None:
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def build_state_payload(match: dict, task_text: str) -> dict:
    rule: TaskRule = match["rule"]
    payload = load_state()
    payload["state"] = rule.state
    payload["detail"] = rule.detail
    payload["hero"] = rule.hero
    payload["routing_rule"] = rule.title
    payload["routing_keywords"] = match["matched_keywords"]
    payload["task_text"] = task_text.strip()
    payload["task_board_reason"] = "task_started"
    payload["updated_at"] = datetime.now().isoformat()
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Match a user task to board state using markdown rules.")
    parser.add_argument("task", help="The task text from the user.")
    parser.add_argument("--rules", default=RULES_FILE, help="Markdown rules file path.")
    parser.add_argument("--apply", action="store_true", help="Write the matched state into state.json.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    rules = parse_rules(args.rules)
    match = pick_rule(args.task, rules)
    if not match:
      result = {
          "ok": False,
          "msg": "No matching rule found.",
          "task": args.task,
          "rules_file": args.rules
      }
      if args.json:
          print(json.dumps(result, ensure_ascii=False, indent=2))
      else:
          print("未匹配到任务规则，请补充 docs/task-routing-rules.md")
      return 1

    payload = build_state_payload(match, args.task)
    result = {
        "ok": True,
        "task": args.task,
        "state": payload["state"],
        "hero": payload["hero"],
        "detail": payload["detail"],
        "routing_rule": payload["routing_rule"],
        "matched_keywords": payload["routing_keywords"],
        "rules_file": args.rules,
        "applied": bool(args.apply)
    }

    if args.apply:
        save_state(payload)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"任务匹配成功: {result['routing_rule']}")
        print(f"状态: {result['state']}")
        print(f"英雄: {result['hero']}")
        print(f"说明: {result['detail']}")
        print(f"关键词: {', '.join(result['matched_keywords'])}")
        if args.apply:
            print("已写入 state.json")

    return 0


if __name__ == "__main__":
    sys.exit(main())
