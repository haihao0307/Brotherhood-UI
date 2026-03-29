#!/usr/bin/env python3
"""簡單的狀態更新工具，用於測試 Brotherhood-UI。"""

from __future__ import annotations

import sys
from datetime import datetime

from state_coordinator import read_state_snapshot, submit_snapshot_event


VALID_STATES = [
    "idle",
    "writing",
    "researching",
    "executing",
    "syncing",
    "error",
]


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: python set_state.py <state> [detail]")
        print(f"状态选项: {', '.join(VALID_STATES)}")
        print("\n例子:")
        print("  python set_state.py idle")
        print('  python set_state.py researching "在查 OpenClaw 文件結構..."')
        print('  python set_state.py writing "在寫主場景隨機短事件..."')
        return 1

    state_name = sys.argv[1]
    detail = sys.argv[2] if len(sys.argv) > 2 else ""

    if state_name not in VALID_STATES:
        print(f"无效状态: {state_name}")
        print(f"有效选项: {', '.join(VALID_STATES)}")
        return 1

    current = read_state_snapshot()
    request_id = current.get("request_id")
    sequence = int(current.get("sequence") or 0) + 1 if request_id else None
    payload = dict(current)
    payload["state"] = state_name
    payload["detail"] = detail
    payload["updated_at"] = datetime.now().isoformat()
    payload["task_board_reason"] = "manual_override"

    _, snapshot = submit_snapshot_event(
        payload,
        source="set_state_manual",
        event_type="manual_set",
        request_id=request_id,
        sequence=sequence,
        reason="manual_override",
    )
    print(f"状态已更新: {snapshot.get('state')} - {snapshot.get('detail', '')}")
    print(f"request_id: {snapshot.get('request_id', '-')}")
    print(f"sequence: {snapshot.get('sequence', '-')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
