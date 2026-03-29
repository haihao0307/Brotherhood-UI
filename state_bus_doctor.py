#!/usr/bin/env python3
"""Diagnostics for the Brotherhood-UI state bus."""

from __future__ import annotations

import argparse
import json
from collections import Counter

from state_coordinator import read_state_snapshot
from state_event_bus import load_event_records


def format_event_line(event: dict) -> str:
    payload = event.get("payload") or {}
    state = payload.get("state") or "-"
    detail = str(payload.get("detail") or "").strip().replace("\n", " ")
    if len(detail) > 36:
        detail = detail[:33] + "..."
    return (
        f"{event.get('created_at', '-')}"
        f" | src={event.get('source', '-')}"
        f" | type={event.get('event_type', '-')}"
        f" | req={event.get('request_id', '-')}"
        f" | seq={event.get('sequence', '-')}"
        f" | state={state}"
        f" | detail={detail}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect Brotherhood-UI state bus snapshot and recent events.")
    parser.add_argument("--tail", type=int, default=12, help="How many recent events to show.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    args = parser.parse_args()

    snapshot = read_state_snapshot()
    events = load_event_records()
    recent_events = events[-max(args.tail, 1) :]
    source_counts = Counter(str(event.get("source") or "unknown") for event in events)

    if args.json:
        print(
            json.dumps(
                {
                    "snapshot": snapshot,
                    "eventCount": len(events),
                    "sourceCounts": dict(source_counts),
                    "recentEvents": recent_events,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    print("Brotherhood-UI State Bus Doctor")
    print("=" * 34)
    print(f"Current state : {snapshot.get('state', '-')}")
    print(f"Detail        : {snapshot.get('detail', '')}")
    print(f"Source        : {snapshot.get('source', '-')}")
    print(f"Request ID    : {snapshot.get('request_id', '-')}")
    print(f"Sequence      : {snapshot.get('sequence', '-')}")
    print(f"Event Type    : {snapshot.get('event_type', '-')}")
    print(f"Updated At    : {snapshot.get('updated_at', '-')}")
    print(f"Event Count   : {len(events)}")
    print("")
    print("Source Counts")
    for source, count in sorted(source_counts.items(), key=lambda item: (-item[1], item[0])):
        print(f"- {source}: {count}")
    print("")
    print(f"Recent Events (last {len(recent_events)})")
    for event in recent_events:
        print(f"- {format_event_line(event)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
