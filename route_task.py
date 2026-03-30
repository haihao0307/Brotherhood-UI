#!/usr/bin/env python3
"""Route a user task into Brotherhood-UI board state using markdown rules."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, List, Optional

from state_coordinator import read_state_snapshot, submit_snapshot_event


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
RULES_FILE = os.path.join(ROOT_DIR, "docs", "task-routing-rules.md")
VALID_STATES = {"idle", "writing", "researching", "executing", "syncing", "error"}
STRONG_KEYWORD_BASE = 4000
KEYWORD_BASE = 1200
WEAK_KEYWORD_BASE = 200
PRIORITY_WEIGHT = 20
MIN_MATCH_SCORE = 650
AMBIGUITY_GAP = 180


@dataclass
class TaskRule:
    title: str
    hero: str
    state: str
    detail: str
    keywords: List[str]
    strong_keywords: List[str] = field(default_factory=list)
    weak_keywords: List[str] = field(default_factory=list)
    exclude_keywords: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)
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
    current_data: dict[str, str] = {}

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
        strong_keywords = parse_keywords(str(current_data.get("strong_keywords", "")))
        weak_keywords = parse_keywords(str(current_data.get("weak_keywords", "")))
        exclude_keywords = parse_keywords(str(current_data.get("exclude_keywords", "")))
        examples = parse_keywords(str(current_data.get("examples", "")))
        hero = str(current_data.get("hero", "")).strip()
        priority = int(str(current_data.get("priority", "0")).strip() or "0")

        if not hero:
            raise ValueError(f"missing hero in rule '{current_title}'")
        if not detail:
            raise ValueError(f"missing detail in rule '{current_title}'")
        if not keywords:
            raise ValueError(f"missing keywords in rule '{current_title}'")

        rules.append(
            TaskRule(
                title=current_title.strip(),
                hero=hero,
                state=state,
                detail=detail,
                keywords=keywords,
                strong_keywords=strong_keywords,
                weak_keywords=weak_keywords,
                exclude_keywords=exclude_keywords,
                examples=examples,
                priority=priority,
            )
        )
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
    kept: List[str] = []
    for keyword in sorted(matched, key=len, reverse=True):
        if any(keyword in existing for existing in kept):
            continue
        kept.append(keyword)
    return sorted(kept, key=lambda item: (-len(item), item))


def merge_keyword_hits(
    strong_hits: List[str],
    keyword_hits: List[str],
    weak_hits: List[str],
) -> tuple[List[str], List[str], List[str]]:
    kept: list[tuple[str, str]] = []
    grouped = {"strong": [], "keyword": [], "weak": []}
    bucket_order = {"strong": 0, "keyword": 1, "weak": 2}
    candidates: list[tuple[str, str]] = []
    for bucket, hits in (("strong", strong_hits), ("keyword", keyword_hits), ("weak", weak_hits)):
        for keyword in filter_overlapping_keywords(hits):
            candidates.append((bucket, keyword))
    for bucket, keyword in sorted(candidates, key=lambda item: (bucket_order[item[0]], -len(item[1]), item[1])):
        if any(keyword in existing for _, existing in kept):
            continue
        kept.append((bucket, keyword))
        grouped[bucket].append(keyword)
    return grouped["strong"], grouped["keyword"], grouped["weak"]


def keyword_score(keyword: str, base_score: int, *, is_strong: bool = False) -> int:
    length = len(keyword)
    if is_strong:
        factor = 1.0
    elif length <= 2:
        factor = 0.15
    elif length == 3:
        factor = 0.45
    elif length == 4:
        factor = 0.75
    else:
        factor = 1.0
    return int(base_score * factor) + length * 10


def evaluate_rule(task_text: str, rule: TaskRule) -> Optional[dict[str, Any]]:
    normalized = normalize_text(task_text)
    if not normalized:
        return None

    matched_exclude_keywords = filter_overlapping_keywords(
        [kw for kw in rule.exclude_keywords if kw and kw in normalized]
    )
    matched_strong_keywords, matched_keywords, matched_weak_keywords = merge_keyword_hits(
        [kw for kw in rule.strong_keywords if kw and kw in normalized],
        [kw for kw in rule.keywords if kw and kw in normalized],
        [kw for kw in rule.weak_keywords if kw and kw in normalized],
    )

    if not matched_strong_keywords and not matched_keywords and not matched_weak_keywords and not matched_exclude_keywords:
        return None

    candidate = {
        "rule": rule,
        "matched_strong_keywords": matched_strong_keywords,
        "matched_keywords": matched_keywords,
        "matched_weak_keywords": matched_weak_keywords,
        "matched_exclude_keywords": matched_exclude_keywords,
        "routing_keywords": matched_strong_keywords + matched_keywords + matched_weak_keywords,
        "score": 0,
        "eligible": False,
        "reason": "",
    }

    if matched_exclude_keywords:
        candidate["reason"] = "excluded"
        return candidate

    if not matched_strong_keywords and not matched_keywords:
        candidate["reason"] = "weak_only"
        return candidate

    score = rule.priority * PRIORITY_WEIGHT
    score += sum(keyword_score(kw, STRONG_KEYWORD_BASE, is_strong=True) for kw in matched_strong_keywords)
    score += sum(keyword_score(kw, KEYWORD_BASE) for kw in matched_keywords)
    score += sum(keyword_score(kw, WEAK_KEYWORD_BASE) for kw in matched_weak_keywords)
    candidate["score"] = score

    if score < MIN_MATCH_SCORE:
        candidate["reason"] = "below_threshold"
        return candidate

    candidate["eligible"] = True
    candidate["reason"] = "matched"
    return candidate


def rank_rules(task_text: str, rules: List[TaskRule]) -> List[dict[str, Any]]:
    candidates = []
    for rule in rules:
        candidate = evaluate_rule(task_text, rule)
        if candidate:
            candidates.append(candidate)
    return sorted(
        candidates,
        key=lambda item: (
            0 if item["eligible"] else 1,
            -int(item["score"]),
            -len(item["matched_strong_keywords"]),
            -len(item["matched_keywords"]),
            item["rule"].title,
        ),
    )


def pick_rule(task_text: str, rules: List[TaskRule]) -> Optional[dict[str, Any]]:
    normalized = normalize_text(task_text)
    if not normalized:
        return None

    ranked = rank_rules(task_text, rules)
    for candidate in ranked:
        if candidate["eligible"]:
            candidate["routing_keywords"] = (
                candidate["matched_strong_keywords"]
                + candidate["matched_keywords"]
                + candidate["matched_weak_keywords"]
            )
            return candidate
    return None


def explain_task(task_text: str, rules: List[TaskRule], limit: int = 5) -> dict[str, Any]:
    ranked = rank_rules(task_text, rules)
    best = next((candidate for candidate in ranked if candidate["eligible"]), None)
    top_candidates = []
    for candidate in ranked[:limit]:
        top_candidates.append(
            {
                "title": candidate["rule"].title,
                "state": candidate["rule"].state,
                "score": candidate["score"],
                "eligible": candidate["eligible"],
                "reason": candidate["reason"],
                "matched_strong_keywords": candidate["matched_strong_keywords"],
                "matched_keywords": candidate["matched_keywords"],
                "matched_weak_keywords": candidate["matched_weak_keywords"],
                "matched_exclude_keywords": candidate["matched_exclude_keywords"],
            }
        )
    return {
        "task": task_text,
        "normalized": normalize_text(task_text),
        "matched": bool(best),
        "best": {
            "title": best["rule"].title,
            "state": best["rule"].state,
            "score": best["score"],
            "routing_keywords": best.get("routing_keywords", []),
        }
        if best
        else None,
        "top_candidates": top_candidates,
    }


def load_benchmark_cases(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("benchmark file must contain a JSON list")
    return [item for item in payload if isinstance(item, dict)]


def evaluate_benchmark_case(case: dict[str, Any], rules: List[TaskRule]) -> dict[str, Any]:
    task = str(case.get("task", "")).strip()
    match = pick_rule(task, rules)
    expect_match = bool(case.get("expect_match", True))
    expected_state = case.get("expected_state")
    expected_rule = case.get("expected_rule")
    passed = True

    if expect_match and not match:
        passed = False
    if not expect_match and match:
        passed = False
    if expected_state and (not match or match["rule"].state != expected_state):
        passed = False
    if expected_rule and (not match or match["rule"].title != expected_rule):
        passed = False

    ranked = rank_rules(task, rules)
    eligible = [candidate for candidate in ranked if candidate["eligible"]]
    ambiguous = False
    if len(eligible) >= 2 and abs(int(eligible[0]["score"]) - int(eligible[1]["score"])) <= AMBIGUITY_GAP:
        ambiguous = True

    return {
        "task": task,
        "passed": passed,
        "expect_match": expect_match,
        "expected_state": expected_state,
        "expected_rule": expected_rule,
        "actual_state": match["rule"].state if match else None,
        "actual_rule": match["rule"].title if match else None,
        "routing_keywords": match.get("routing_keywords", []) if match else [],
        "ambiguous": ambiguous,
    }


def generate_report(rules: List[TaskRule], benchmark_path: str) -> dict[str, Any]:
    cases = load_benchmark_cases(benchmark_path)
    results = [evaluate_benchmark_case(case, rules) for case in cases]
    failed_cases = [result for result in results if not result["passed"]]
    fallback_cases = [result for result in results if not result["actual_state"]]
    ambiguous_cases = [result for result in results if result["ambiguous"]]
    state_totals: dict[str, int] = {}
    rule_totals: dict[str, int] = {}
    for result in results:
        actual_state = result["actual_state"]
        actual_rule = result["actual_rule"]
        if actual_state:
            state_totals[actual_state] = state_totals.get(actual_state, 0) + 1
        if actual_rule:
            rule_totals[actual_rule] = rule_totals.get(actual_rule, 0) + 1
    return {
        "benchmark_path": benchmark_path,
        "total": len(results),
        "passed": len(results) - len(failed_cases),
        "failed": len(failed_cases),
        "failed_cases": failed_cases,
        "fallback_cases": fallback_cases,
        "ambiguous_cases": ambiguous_cases,
        "state_totals": dict(sorted(state_totals.items())),
        "rule_totals": dict(sorted(rule_totals.items(), key=lambda item: (-item[1], item[0]))),
        "results": results,
    }


def load_state() -> dict[str, Any]:
    return read_state_snapshot()


def save_state(
    payload: dict[str, Any],
    *,
    source: str = "route_task",
    event_type: str = "route_apply",
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


def build_state_payload(match: dict[str, Any], task_text: str) -> dict[str, Any]:
    rule: TaskRule = match["rule"]
    payload = load_state()
    payload["state"] = rule.state
    payload["detail"] = rule.detail
    payload["hero"] = rule.hero
    payload["routing_rule"] = rule.title
    payload["routing_keywords"] = match.get("routing_keywords", [])
    payload["task_text"] = task_text.strip()
    payload["task_board_reason"] = "task_started"
    payload["updated_at"] = datetime.now().isoformat()
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Match a user task to board state using markdown rules.")
    parser.add_argument("task", nargs="?", help="The task text from the user.")
    parser.add_argument("--rules", default=RULES_FILE, help="Markdown rules file path.")
    parser.add_argument("--apply", action="store_true", help="Write the matched state into state.json.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument("--explain", action="store_true", help="Explain candidate matches for the given task.")
    parser.add_argument("--report", default=None, help="Run a benchmark report from a JSON file.")
    args = parser.parse_args()

    rules = parse_rules(args.rules)
    if args.report:
        report = generate_report(rules, args.report)
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print(f"Benchmark: {report['benchmark_path']}")
            print(f"Passed: {report['passed']} / {report['total']}")
            print(f"Failed: {report['failed']}")
            print(f"Fallbacks: {len(report['fallback_cases'])}")
            print(f"Ambiguous: {len(report['ambiguous_cases'])}")
            if report["state_totals"]:
                print("State totals:")
                for state, count in report["state_totals"].items():
                    print(f"  - {state}: {count}")
            if report["rule_totals"]:
                print("Top rules:")
                for title, count in list(report["rule_totals"].items())[:8]:
                    print(f"  - {title}: {count}")
        return 0

    if not args.task:
        parser.error("task is required unless --report is provided")

    if args.explain:
        explanation = explain_task(args.task, rules)
        if args.json:
            print(json.dumps(explanation, ensure_ascii=False, indent=2))
        else:
            print(f"任务: {explanation['task']}")
            print(f"归一化: {explanation['normalized']}")
            if explanation["best"]:
                print(
                    f"最佳匹配: {explanation['best']['title']} "
                    f"({explanation['best']['state']}, score={explanation['best']['score']})"
                )
                print(f"关键词: {', '.join(explanation['best']['routing_keywords'])}")
            else:
                print("最佳匹配: 无")
            for candidate in explanation["top_candidates"]:
                print(
                    f"- {candidate['title']} [{candidate['state']}] "
                    f"score={candidate['score']} eligible={candidate['eligible']} reason={candidate['reason']}"
                )
        return 0

    match = pick_rule(args.task, rules)
    if not match:
        result = {
            "ok": False,
            "msg": "No matching rule found.",
            "task": args.task,
            "rules_file": args.rules,
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
        "matched_strong_keywords": match["matched_strong_keywords"],
        "matched_weak_keywords": match["matched_weak_keywords"],
        "rules_file": args.rules,
        "applied": bool(args.apply),
    }

    if args.apply:
        snapshot = save_state(payload, reason="task_started")
        result["request_id"] = snapshot.get("request_id")
        result["sequence"] = snapshot.get("sequence")

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"任务匹配成功: {result['routing_rule']}")
        print(f"状态: {result['state']}")
        print(f"英雄: {result['hero']}")
        print(f"说明: {result['detail']}")
        print(f"关键词: {', '.join(result['matched_keywords'])}")
        if args.apply:
            print("已写入状态总线")

    return 0


if __name__ == "__main__":
    sys.exit(main())
