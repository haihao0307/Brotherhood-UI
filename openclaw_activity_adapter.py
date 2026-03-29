#!/usr/bin/env python3
"""Protocol-aware activity adapter for OpenClaw -> Brotherhood-UI sync."""

from __future__ import annotations

import json
import os
import re
from typing import Any


PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PROTOCOL_FILE = os.path.join(PROJECT_ROOT, "openclaw-activity-protocol.json")

JSON_LIKE_RE = re.compile(r"^\s*[\[{]")
PROTOCOL_PREFIX_RE = re.compile(
    r"(?:BROTHERHOOD_UI|BROTHERHOOD_EVENT)\s*:\s*(\{.*\})",
    re.IGNORECASE | re.DOTALL,
)

TEXT_HINT_KEYS = {
    "query",
    "prompt",
    "task",
    "instruction",
    "instructions",
    "command",
    "path",
    "file_path",
    "filepath",
    "filePath",
    "url",
    "cwd",
    "workdir",
}

STATE_ALIASES = {
    "idle": "idle",
    "research": "researching",
    "researching": "researching",
    "write": "writing",
    "writing": "writing",
    "execute": "executing",
    "executing": "executing",
    "run": "executing",
    "running": "executing",
    "sync": "syncing",
    "syncing": "syncing",
    "error": "error",
    "fail": "error",
    "failed": "error",
}


def load_protocol_config(path: str = DEFAULT_PROTOCOL_FILE) -> dict[str, Any]:
    if not os.path.exists(path):
        return {
            "loaded": False,
            "path": path,
            "version": 1,
            "toolStates": {
                "researching": ["read", "web_search", "web_fetch", "memory_search", "memory_get"],
                "writing": ["write", "edit"],
                "executing": ["exec"],
                "syncing": ["sessions_send"],
            },
            "observeOnlyTools": ["process", "browser", "sessions_spawn", "subagents"],
            "stateHintKeys": [
                "state",
                "state_hint",
                "workflow_state",
                "activity",
                "activity_type",
                "phase",
                "status",
                "mode",
                "intent",
            ],
            "textHintKeys": sorted(TEXT_HINT_KEYS),
            "customEventTypes": ["brotherhood:activity", "openclaw:activity"],
        }
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    payload["loaded"] = True
    payload["path"] = path
    payload.setdefault("version", 1)
    payload.setdefault("toolStates", {})
    payload.setdefault("observeOnlyTools", [])
    payload.setdefault("stateHintKeys", [])
    payload.setdefault("textHintKeys", [])
    payload.setdefault("customEventTypes", [])
    return payload


def shorten_text(text: str, limit: int = 80) -> str:
    normalized = " ".join(str(text or "").split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


def normalize_state_hint(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return STATE_ALIASES.get(value.strip().lower())


def parse_json_like(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        if JSON_LIKE_RE.match(text):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                return {}
        return {"raw": text}
    return {}


def walk_argument_values(arguments: Any):
    if isinstance(arguments, dict):
        for key, value in arguments.items():
            yield key, value
            yield from walk_argument_values(value)
        return
    if isinstance(arguments, list):
        for item in arguments:
            yield from walk_argument_values(item)


def extract_text_hints(arguments: Any, protocol: dict[str, Any]) -> list[str]:
    keys = set(TEXT_HINT_KEYS)
    keys.update(str(item).strip() for item in protocol.get("textHintKeys", []) if str(item).strip())
    hints: list[str] = []
    for key, value in walk_argument_values(arguments):
        if not isinstance(key, str) or key.strip() not in keys:
            continue
        if not isinstance(value, str):
            continue
        text = value.strip()
        if text:
            hints.append(text)
    return hints


def infer_explicit_state_hint(arguments: Any, protocol: dict[str, Any]) -> str | None:
    keys = set(str(item).strip() for item in protocol.get("stateHintKeys", []) if str(item).strip())
    for key, value in walk_argument_values(arguments):
        if not isinstance(key, str) or key.strip() not in keys:
            continue
        state = normalize_state_hint(value)
        if state:
            return state
    return None


def _extract_protocol_dict(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        if isinstance(payload.get("brotherhood"), dict):
            return payload["brotherhood"]
        if isinstance(payload.get("brotherhood_ui"), dict):
            return payload["brotherhood_ui"]
        if isinstance(payload.get("activity"), dict):
            return payload["activity"]
        command = str(payload.get("command") or payload.get("event_type") or "").strip().lower()
        has_state = any(key in payload for key in ("state", "phase"))
        has_note = any(key in payload for key in ("note", "detail", "text"))
        if has_state or (command in {"phase", "done", "fail"} and has_note):
            return payload
    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            return None
        if JSON_LIKE_RE.match(text):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None
            if parsed is not None:
                return _extract_protocol_dict(parsed)
        match = PROTOCOL_PREFIX_RE.search(text)
        if match:
            try:
                parsed = json.loads(match.group(1))
            except json.JSONDecodeError:
                return None
            return _extract_protocol_dict(parsed)
    return None


def extract_protocol_event(payload: Any) -> dict[str, Any] | None:
    data = _extract_protocol_dict(payload)
    if not isinstance(data, dict):
        return None
    event: dict[str, Any] = {}
    state = normalize_state_hint(data.get("state") or data.get("phase"))
    note = data.get("note") or data.get("detail") or data.get("text")
    command = data.get("command") or data.get("event_type")
    request_id = data.get("request_id")
    if state:
        event["state"] = state
    if isinstance(note, str) and note.strip():
        event["note"] = note.strip()
    if isinstance(command, str) and command.strip():
        event["command"] = command.strip().lower()
    if isinstance(request_id, str) and request_id.strip():
        event["request_id"] = request_id.strip()
    if not event:
        return None
    return event


def infer_tool_activity(tool_name: str, arguments: Any, protocol: dict[str, Any]) -> dict[str, Any]:
    lower = tool_name.lower()
    parsed_args = parse_json_like(arguments)
    protocol_event = extract_protocol_event(parsed_args)
    if protocol_event:
        return {
            "state": protocol_event.get("state"),
            "confidence": "high",
            "origin": "protocol_hint",
            "emit_bridge": True,
            "note": protocol_event.get("note") or f"正在處理 {tool_name} 工作流",
            "command": protocol_event.get("command"),
            "request_id": protocol_event.get("request_id"),
        }

    explicit_state = infer_explicit_state_hint(parsed_args, protocol)
    text_hints = extract_text_hints(parsed_args, protocol)

    path = None
    for hint in text_hints:
        if "/" in hint or "\\" in hint or hint.startswith("http"):
            path = hint
            break

    query = parsed_args.get("query")
    command = parsed_args.get("command")
    prompt = parsed_args.get("prompt")
    skill = parsed_args.get("skill")

    if explicit_state:
        note_hint = next((shorten_text(hint, 60) for hint in text_hints if hint), None)
        return {
            "state": explicit_state,
            "confidence": "high",
            "origin": "explicit_hint",
            "emit_bridge": True,
            "note": note_hint and f"正在處理：{note_hint}" or f"正在以 {explicit_state} 狀態處理任務",
        }

    tool_states = {
        state: {str(name).strip().lower() for name in names}
        for state, names in dict(protocol.get("toolStates", {})).items()
    }
    observe_only = {str(name).strip().lower() for name in protocol.get("observeOnlyTools", [])}

    if lower in tool_states.get("researching", set()):
        if isinstance(query, str) and query.strip():
            return {"state": "researching", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在檢索資料：{query.strip()}"}
        if path:
            return {"state": "researching", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在查閱資料：{path}"}
        return {"state": "researching", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在調研並使用 {tool_name} 工具"}

    if lower in tool_states.get("writing", set()):
        if path:
            return {"state": "writing", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在修改內容：{path}"}
        if isinstance(prompt, str) and prompt.strip():
            return {"state": "writing", "confidence": "medium", "origin": "tool_family", "emit_bridge": True, "note": f"正在撰寫內容：{shorten_text(prompt.strip(), 60)}"}
        return {"state": "writing", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在編寫並使用 {tool_name} 工具"}

    if lower in tool_states.get("syncing", set()):
        target = path or (skill.strip() if isinstance(skill, str) and skill.strip() else tool_name)
        return {"state": "syncing", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在同步會話：{target}"}

    if lower in tool_states.get("executing", set()):
        if isinstance(command, str) and command.strip():
            return {"state": "executing", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在執行命令：{shorten_text(command.strip(), 60)}"}
        if path:
            return {"state": "executing", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在處理文件：{path}"}
        return {"state": "executing", "confidence": "high", "origin": "tool_family", "emit_bridge": True, "note": f"正在執行 {tool_name} 工具"}

    if lower in observe_only:
        if isinstance(command, str) and command.strip():
            return {"state": None, "confidence": "low", "origin": "observe_only_tool", "emit_bridge": False, "note": f"正在執行命令：{shorten_text(command.strip(), 60)}"}
        if path:
            return {"state": None, "confidence": "low", "origin": "observe_only_tool", "emit_bridge": False, "note": f"正在處理路徑：{path}"}
        if isinstance(query, str) and query.strip():
            return {"state": None, "confidence": "low", "origin": "observe_only_tool", "emit_bridge": False, "note": f"正在處理請求：{shorten_text(query.strip(), 60)}"}
        return {"state": None, "confidence": "low", "origin": "observe_only_tool", "emit_bridge": False, "note": f"正在使用 {tool_name} 工具處理任務"}

    if path:
        return {"state": None, "confidence": "low", "origin": "fallback", "emit_bridge": False, "note": f"正在處理：{path}"}
    return {"state": None, "confidence": "low", "origin": "fallback", "emit_bridge": False, "note": f"正在使用 {tool_name} 工具處理任務"}
