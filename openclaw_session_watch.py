#!/usr/bin/env python3
"""Watch local OpenClaw session files and mirror activity into Brotherhood-UI."""

from __future__ import annotations

import argparse
import json
import locale
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import Any

from openclaw_activity_adapter import (
    DEFAULT_PROTOCOL_FILE,
    extract_protocol_event,
    infer_tool_activity,
    load_protocol_config,
)
from state_event_bus import generate_request_id


PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
BRIDGE_SCRIPT = os.path.join(PROJECT_ROOT, "openclaw_bridge.py")
RUNTIME_DIR = os.path.join(PROJECT_ROOT, ".runtime")
DEFAULT_STATUS_FILE = os.path.join(RUNTIME_DIR, "openclaw-sync-status.json")
DEFAULT_OPENCLAW_ROOT = os.path.join(os.path.expanduser("~"), ".openclaw")
DEFAULT_SESSIONS_JSON = os.path.join(
    DEFAULT_OPENCLAW_ROOT,
    "agents",
    "main",
    "sessions",
    "sessions.json",
)
DEFAULT_SESSION_KEY = "agent:main:main"

SENDER_BLOCK_RE = re.compile(
    r"^Sender \(untrusted metadata\):\s*```json.*?```\s*",
    re.DOTALL,
)
TIMESTAMP_LINE_RE = re.compile(r"^\[[^\]]+\]\s*")
INTERNAL_STARTUP_PROMPT_RE = re.compile(
    r"^A new session was started via /new or /reset\.",
    re.IGNORECASE,
)
INTERNAL_META_PROMPT_RE = re.compile(
    r"^(Current time:|Do not mention internal steps, files, tools, or reasoning\.)",
    re.IGNORECASE,
)

def configure_console_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(errors="replace")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def extract_text_blocks(content: Any) -> list[str]:
    if not isinstance(content, list):
        return []

    chunks: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                chunks.append(text.strip())
    return chunks


def extract_tool_calls(content: Any) -> list[dict[str, Any]]:
    if not isinstance(content, list):
        return []

    calls: list[dict[str, Any]] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") != "toolCall":
            continue
        name = block.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        calls.append(
            {
                "id": block.get("id"),
                "name": name.strip(),
                "arguments": block.get("arguments"),
            }
        )
    return calls


def extract_tool_result_call_id(message: Any, record: dict[str, Any]) -> Any:
    if isinstance(message, dict):
        tool_call_id = message.get("toolCallId")
        if isinstance(tool_call_id, str) and tool_call_id.strip():
            return tool_call_id
    return record.get("parentId")


def clean_user_text(raw_text: str) -> str:
    text = raw_text.strip()
    text = SENDER_BLOCK_RE.sub("", text)
    text = TIMESTAMP_LINE_RE.sub("", text)
    return text.strip()


def is_internal_user_prompt(text: str) -> bool:
    value = clean_user_text(text)
    if not value:
        return True
    if INTERNAL_STARTUP_PROMPT_RE.search(value):
        return True
    if value.startswith("Run your Session Startup sequence"):
        return True
    if INTERNAL_META_PROMPT_RE.search(value) and "what they want to do" in value.lower():
        return True
    return False


def shorten_text(text: str, limit: int = 80) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


@dataclass
class WatchState:
    session_file: str | None = None
    session_id: str | None = None
    offset: int = 0
    active_request_id: str | None = None
    last_user_message_id: str | None = None
    last_assistant_message_id: str | None = None
    last_tool_call_id: str | None = None
    last_custom_error_id: str | None = None
    last_bridge_command: str | None = None
    last_bridge_value: str | None = None
    recent_message_ids: set[str] = field(default_factory=set)
    recent_tool_call_ids: set[str] = field(default_factory=set)
    pending_tool_call_ids: set[str] = field(default_factory=set)
    last_phase_signature: str | None = None
    last_phase_at: float = 0.0
    last_observed_tool_name: str | None = None
    last_observed_activity: str | None = None
    last_observed_activity_source: str | None = None
    last_ignored_phase_reason: str | None = None
    observed_phase_count: int = 0
    protocol_mode: str = "fallback"
    last_protocol_command: str | None = None


class OpenClawSessionWatcher:
    def __init__(
        self,
        sessions_json: str,
        session_key: str,
        poll_interval: float,
        bootstrap_current: bool,
        bootstrap_max_age_seconds: int,
        status_file: str,
        protocol_file: str,
    ) -> None:
        self.sessions_json = sessions_json
        self.session_key = session_key
        self.poll_interval = poll_interval
        self.bootstrap_current = bootstrap_current
        self.bootstrap_max_age_seconds = bootstrap_max_age_seconds
        self.status_file = status_file
        self.protocol = load_protocol_config(protocol_file)
        self.state = WatchState()
        self.last_error: str | None = None
        self.started_at = time.time()

    def run(self) -> int:
        os.makedirs(os.path.dirname(self.status_file), exist_ok=True)
        print(f"[watch] sessions.json: {self.sessions_json}")
        print(f"[watch] session key: {self.session_key}")
        self.write_status("starting")

        while True:
            try:
                session_file, session_id = self.resolve_active_session()
                if session_file and session_file != self.state.session_file:
                    self.switch_session(session_file, session_id)

                if self.state.session_file:
                    self.read_new_lines()
                self.last_error = None
                self.write_status("running")
            except KeyboardInterrupt:
                self.write_status("stopped")
                print("[watch] stopped")
                return 0
            except Exception as exc:
                self.last_error = str(exc)
                self.write_status("warning")
                print(f"[watch] warning: {exc}", file=sys.stderr)

            time.sleep(self.poll_interval)

    def resolve_active_session(self) -> tuple[str | None, str | None]:
        if not os.path.exists(self.sessions_json):
            raise FileNotFoundError(f"sessions.json not found: {self.sessions_json}")

        data = load_json(self.sessions_json)
        if not isinstance(data, dict):
            return None, None

        record = data.get(self.session_key)
        if not isinstance(record, dict):
            record = self.pick_latest_session_record(data)
        if not isinstance(record, dict):
            return None, None

        session_file = record.get("sessionFile")
        session_id = record.get("sessionId")
        if not isinstance(session_file, str) or not session_file.strip():
            return None, None
        return session_file, session_id if isinstance(session_id, str) else None

    def pick_latest_session_record(self, data: dict[str, Any]) -> dict[str, Any] | None:
        latest_record: dict[str, Any] | None = None
        latest_updated_at = -1.0
        for value in data.values():
            if not isinstance(value, dict):
                continue
            session_file = value.get("sessionFile")
            updated_at = value.get("updatedAt")
            if not isinstance(session_file, str) or not session_file.strip():
                continue
            score = float(updated_at) if isinstance(updated_at, (int, float)) else 0.0
            if score >= latest_updated_at:
                latest_updated_at = score
                latest_record = value
        return latest_record

    def switch_session(self, session_file: str, session_id: str | None) -> None:
        self.state.session_file = session_file
        self.state.session_id = session_id
        self.state.offset = 0
        self.state.active_request_id = None
        self.state.recent_message_ids.clear()
        self.state.recent_tool_call_ids.clear()
        self.state.pending_tool_call_ids.clear()
        self.state.last_phase_signature = None
        self.state.last_phase_at = 0.0
        self.state.last_observed_tool_name = None
        self.state.last_observed_activity = None
        self.state.last_observed_activity_source = None
        self.state.last_ignored_phase_reason = None
        self.state.observed_phase_count = 0
        self.state.protocol_mode = "fallback"
        self.state.last_protocol_command = None
        print(f"[watch] active session -> {session_file}")

        if not os.path.exists(session_file):
            print("[watch] session file does not exist yet")
            return

        if self.bootstrap_current and self.session_is_recent():
            lines = self.read_all_lines(session_file)
            self.state.offset = os.path.getsize(session_file)
            if lines:
                self.bootstrap_recent_activity(lines)
        else:
            self.state.offset = os.path.getsize(session_file)

    def find_last_real_user_index(self, records: list[dict[str, Any]]) -> int | None:
        for index in range(len(records) - 1, -1, -1):
            record = records[index]
            if not isinstance(record, dict) or record.get("type") != "message":
                continue
            message = record.get("message")
            if not isinstance(message, dict):
                continue
            if message.get("role") != "user":
                continue
            text_blocks = extract_text_blocks(message.get("content"))
            if not text_blocks:
                continue
            user_text = clean_user_text("\n".join(text_blocks))
            if not user_text or is_internal_user_prompt(user_text):
                continue
            return index
        return None

    def prime_request_context(self, records: list[dict[str, Any]]) -> None:
        index = self.find_last_real_user_index(records)
        if index is None:
            return
        record = records[index]
        message_id = record.get("id")
        self.state.active_request_id = self.build_request_id(message_id)
        self.state.last_user_message_id = message_id if isinstance(message_id, str) else None

    def bootstrap_recent_activity(self, records: list[dict[str, Any]]) -> None:
        start_index = self.find_last_real_user_index(records)
        if start_index is None:
            self.prime_request_context(records)
            return
        for record in records[start_index:]:
            self.process_record(record, bootstrap=True)

    def session_is_recent(self) -> bool:
        try:
            data = load_json(self.sessions_json)
            record = data.get(self.session_key)
            updated_at = record.get("updatedAt")
            if isinstance(updated_at, (int, float)):
                age = (time.time() * 1000 - float(updated_at)) / 1000
                return age <= self.bootstrap_max_age_seconds
        except Exception:
            pass
        return False

    def read_all_lines(self, path: str) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        with open(path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    records.append(payload)
        return records

    def read_new_lines(self) -> None:
        assert self.state.session_file is not None
        path = self.state.session_file
        if not os.path.exists(path):
            return

        file_size = os.path.getsize(path)
        if file_size < self.state.offset:
            self.state.offset = 0

        with open(path, "r", encoding="utf-8") as handle:
            handle.seek(self.state.offset)
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    self.process_record(payload, bootstrap=False)
            self.state.offset = handle.tell()

    def process_record(self, record: dict[str, Any], bootstrap: bool) -> None:
        record_type = record.get("type")
        if record_type == "message":
            self.process_message(record, bootstrap)
            return

        if record_type == "custom":
            self.process_custom(record)

    def remember_message_id(self, message_id: Any) -> bool:
        if not isinstance(message_id, str) or not message_id.strip():
            return False
        if message_id in self.state.recent_message_ids:
            return True
        self.state.recent_message_ids.add(message_id)
        if len(self.state.recent_message_ids) > 128:
            self.state.recent_message_ids = set(list(self.state.recent_message_ids)[-96:])
        return False

    def remember_tool_call_id(self, tool_call_id: Any) -> bool:
        if not isinstance(tool_call_id, str) or not tool_call_id.strip():
            return False
        if tool_call_id in self.state.recent_tool_call_ids:
            return True
        self.state.recent_tool_call_ids.add(tool_call_id)
        if len(self.state.recent_tool_call_ids) > 256:
            self.state.recent_tool_call_ids = set(list(self.state.recent_tool_call_ids)[-192:])
        return False

    def mark_tool_call_pending(self, tool_call_id: Any) -> None:
        if isinstance(tool_call_id, str) and tool_call_id.strip():
            self.state.pending_tool_call_ids.add(tool_call_id.strip())

    def clear_tool_call_pending(self, tool_call_id: Any) -> None:
        if isinstance(tool_call_id, str) and tool_call_id.strip():
            self.state.pending_tool_call_ids.discard(tool_call_id.strip())

    def ensure_active_request_id(self, fallback_id: Any = None) -> str:
        if self.state.active_request_id:
            return self.state.active_request_id
        request_id = self.build_request_id(fallback_id)
        self.state.active_request_id = request_id
        return request_id

    def should_emit_phase(self, signature: str, min_interval_seconds: float = 2.5) -> bool:
        now = time.time()
        if (
            signature == self.state.last_phase_signature
            and now - self.state.last_phase_at < min_interval_seconds
        ):
            return False
        self.state.last_phase_signature = signature
        self.state.last_phase_at = now
        return True

    def process_message(self, record: dict[str, Any], bootstrap: bool) -> None:
        message_id = record.get("id")
        message = record.get("message")
        if not isinstance(message, dict):
            return

        role = message.get("role")
        if role == "user":
            if self.remember_message_id(message_id):
                return
            text_blocks = extract_text_blocks(message.get("content"))
            if not text_blocks:
                return
            user_text = clean_user_text("\n".join(text_blocks))
            if not user_text or is_internal_user_prompt(user_text):
                return
            self.state.last_user_message_id = message_id if isinstance(message_id, str) else None
            self.state.active_request_id = self.build_request_id(message_id)
            self.invoke_bridge("start", user_text, request_id=self.state.active_request_id)
            return

        if role == "assistant":
            if self.remember_message_id(message_id):
                return

            text_blocks = extract_text_blocks(message.get("content"))
            tool_calls = extract_tool_calls(message.get("content"))

            if text_blocks and text_blocks[0].startswith("⚠️ Agent failed before reply:"):
                detail = shorten_text(text_blocks[0], 100)
                self.invoke_bridge("fail", detail, request_id=self.state.active_request_id)
                self.state.last_assistant_message_id = (
                    message_id if isinstance(message_id, str) else None
                )
                self.state.active_request_id = None
                return

            if tool_calls:
                request_id = self.ensure_active_request_id(message_id)
                for tool_call in tool_calls:
                    tool_call_id = tool_call.get("id")
                    if self.remember_tool_call_id(tool_call_id):
                        continue
                    tool_name = tool_call["name"]
                    activity = infer_tool_activity(tool_name, tool_call.get("arguments"), self.protocol)
                    self.state.last_observed_tool_name = tool_name
                    self.state.last_observed_activity = activity["note"]
                    self.state.last_observed_activity_source = activity.get("origin")
                    self.state.protocol_mode = "explicit" if activity.get("origin") == "protocol_hint" else "fallback"
                    tool_call_id = tool_call.get("id")
                    self.mark_tool_call_pending(tool_call_id)
                    if not activity.get("emit_bridge", False):
                        self.state.last_ignored_phase_reason = f"{tool_name}: {activity.get('origin', 'unknown')}"
                        continue
                    note = activity["note"]
                    state = activity["state"]
                    confidence = activity["confidence"]
                    protocol_command = activity.get("command")
                    signature = f"{request_id}:{state or 'route'}:{note}"
                    if not self.should_emit_phase(signature):
                        self.state.last_ignored_phase_reason = f"{tool_name}: duplicate-phase"
                        continue
                    extra_args: list[str] = []
                    if state and confidence == "high":
                        extra_args = ["--state", state]
                    self.state.observed_phase_count += 1
                    self.state.last_ignored_phase_reason = None
                    self.state.last_protocol_command = protocol_command
                    self.invoke_bridge(
                        protocol_command or "phase",
                        note,
                        extra_args=extra_args,
                        request_id=activity.get("request_id") or request_id,
                    )
                    if isinstance(tool_call_id, str):
                        self.state.last_tool_call_id = tool_call_id
                self.state.last_assistant_message_id = (
                    message_id if isinstance(message_id, str) else None
                )
                return

            if text_blocks:
                protocol_event = None
                for block in text_blocks:
                    protocol_event = extract_protocol_event(block)
                    if protocol_event:
                        break
                if protocol_event:
                    request_id = protocol_event.get("request_id") or self.ensure_active_request_id(message_id)
                    command = protocol_event.get("command") or "phase"
                    note = protocol_event.get("note") or shorten_text(text_blocks[0], 100)
                    self.state.protocol_mode = "explicit"
                    self.state.last_protocol_command = command
                    if command in {"done", "fail"}:
                        self.invoke_bridge(command, note, request_id=request_id)
                        if command == "done":
                            self.state.pending_tool_call_ids.clear()
                        self.state.active_request_id = None
                        self.state.last_assistant_message_id = (
                            message_id if isinstance(message_id, str) else None
                        )
                        return
                    signature = f"{request_id}:{protocol_event.get('state') or 'route'}:{note}"
                    if self.should_emit_phase(signature):
                        extra_args = []
                        if protocol_event.get("state"):
                            extra_args = ["--state", protocol_event["state"]]
                        self.state.observed_phase_count += 1
                        self.state.last_ignored_phase_reason = None
                        self.invoke_bridge(command, note, request_id=request_id, extra_args=extra_args)
                    else:
                        self.state.last_ignored_phase_reason = "assistant-protocol-duplicate"
                    self.state.last_assistant_message_id = (
                        message_id if isinstance(message_id, str) else None
                    )
                    return
                summary = shorten_text(text_blocks[0], 100)
                if not self.state.active_request_id:
                    if bootstrap:
                        return
                    return
                if self.state.pending_tool_call_ids:
                    self.state.last_ignored_phase_reason = f"assistant-text-waiting:{len(self.state.pending_tool_call_ids)}"
                    return
                self.invoke_bridge("done", summary, request_id=self.state.active_request_id)
                self.state.last_assistant_message_id = (
                    message_id if isinstance(message_id, str) else None
                )
                self.state.active_request_id = None
                return

            if bootstrap:
                return

        if role == "toolResult" and record.get("isError") is True:
            self.clear_tool_call_pending(extract_tool_result_call_id(message, record))
            if not self.state.active_request_id:
                return
            error_text_blocks = extract_text_blocks(message.get("content"))
            detail = shorten_text(
                error_text_blocks[0] if error_text_blocks else "OpenClaw 工具执行失敗",
                100,
            )
            self.invoke_bridge("fail", detail, request_id=self.state.active_request_id)
            self.state.active_request_id = None
            self.state.pending_tool_call_ids.clear()
            return

        if role == "toolResult":
            self.clear_tool_call_pending(extract_tool_result_call_id(message, record))

    def process_custom(self, record: dict[str, Any]) -> None:
        custom_type = record.get("customType")
        if custom_type == "openclaw:prompt-error":
            custom_id = record.get("id")
            if isinstance(custom_id, str) and custom_id == self.state.last_custom_error_id:
                return

            data = record.get("data")
            if not isinstance(data, dict):
                return
            error = data.get("error")
            if not isinstance(error, str) or error.strip() == "aborted":
                return

            self.state.last_custom_error_id = custom_id if isinstance(custom_id, str) else None
            self.invoke_bridge("fail", shorten_text(error.strip(), 100), request_id=self.state.active_request_id)
            self.state.active_request_id = None
            self.state.pending_tool_call_ids.clear()
            return

        custom_event_types = set(str(item).strip() for item in self.protocol.get("customEventTypes", []))
        if custom_type not in custom_event_types:
            return

        data = record.get("data")
        protocol_event = extract_protocol_event(data)
        if not protocol_event:
            return

        request_id = protocol_event.get("request_id") or self.ensure_active_request_id(record.get("id"))
        command = protocol_event.get("command") or "phase"
        note = protocol_event.get("note") or f"正在處理 {custom_type}"
        self.state.protocol_mode = "explicit"
        self.state.last_protocol_command = command

        if command in {"done", "fail"}:
            self.invoke_bridge(command, note, request_id=request_id)
            self.state.pending_tool_call_ids.clear()
            self.state.active_request_id = None
            return

        signature = f"{request_id}:{protocol_event.get('state') or 'route'}:{note}"
        if not self.should_emit_phase(signature):
            self.state.last_ignored_phase_reason = f"{custom_type}: duplicate-phase"
            return
        extra_args: list[str] = []
        if protocol_event.get("state"):
            extra_args = ["--state", protocol_event["state"]]
        self.state.observed_phase_count += 1
        self.state.last_ignored_phase_reason = None
        self.invoke_bridge(command, note, request_id=request_id, extra_args=extra_args)

    def build_request_id(self, message_id: Any) -> str:
        base = self.state.session_id or "session"
        suffix = str(message_id).strip() if isinstance(message_id, str) and message_id.strip() else None
        if suffix:
            safe_suffix = re.sub(r"[^a-zA-Z0-9_-]+", "_", suffix)[:48]
            return f"openclaw_{base}_{safe_suffix}"
        return generate_request_id("openclaw")

    def invoke_bridge(
        self,
        command: str,
        value: str,
        extra_args: list[str] | None = None,
        request_id: str | None = None,
    ) -> None:
        args = [sys.executable, BRIDGE_SCRIPT, command, value]
        if request_id:
            args.extend(["--request-id", request_id])
        args.extend(["--source", "openclaw_watch"])
        if extra_args:
            args.extend(extra_args)
        print(f"[watch] bridge -> {command}: {value}")
        self.state.last_bridge_command = command
        self.state.last_bridge_value = value
        completed = subprocess.run(
            args,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding=locale.getpreferredencoding(False),
            errors="replace",
        )
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        if stdout.strip():
            print(stdout.strip())
        if completed.returncode != 0:
            message = stderr.strip() or "bridge command failed"
            self.last_error = message
            print(f"[watch] bridge error: {message}", file=sys.stderr)
        else:
            self.last_error = None
        self.write_status("running")

    def write_status(self, phase: str) -> None:
        payload = {
            "status": phase,
            "startedAt": self.started_at,
            "heartbeatAt": time.time(),
            "sessionsJson": self.sessions_json,
            "sessionKey": self.session_key,
            "sessionFile": self.state.session_file,
            "sessionId": self.state.session_id,
            "activeRequestId": self.state.active_request_id,
            "lastBridgeCommand": self.state.last_bridge_command,
            "lastBridgeValue": self.state.last_bridge_value,
            "lastPhaseSignature": self.state.last_phase_signature,
            "lastPhaseAt": self.state.last_phase_at,
            "lastObservedToolName": self.state.last_observed_tool_name,
            "lastObservedActivity": self.state.last_observed_activity,
            "lastObservedActivitySource": self.state.last_observed_activity_source,
            "lastIgnoredPhaseReason": self.state.last_ignored_phase_reason,
            "observedPhaseCount": self.state.observed_phase_count,
            "pendingToolCallCount": len(self.state.pending_tool_call_ids),
            "protocolMode": self.state.protocol_mode,
            "protocolVersion": self.protocol.get("version"),
            "protocolPath": self.protocol.get("path"),
            "lastProtocolCommand": self.state.last_protocol_command,
            "lastError": self.last_error,
        }
        with open(self.status_file, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Watch local OpenClaw sessions and sync them into Brotherhood-UI.",
    )
    parser.add_argument(
        "--sessions-json",
        default=DEFAULT_SESSIONS_JSON,
        help="Path to OpenClaw sessions.json.",
    )
    parser.add_argument(
        "--session-key",
        default=DEFAULT_SESSION_KEY,
        help="OpenClaw session key to follow.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=1.0,
        help="Polling interval in seconds.",
    )
    parser.add_argument(
        "--bootstrap-current",
        action="store_true",
        help="On startup, inspect the latest record of the current session once.",
    )
    parser.add_argument(
        "--bootstrap-max-age-seconds",
        type=int,
        default=1800,
        help="Only bootstrap the current session when it was updated recently.",
    )
    parser.add_argument(
        "--status-file",
        default=DEFAULT_STATUS_FILE,
        help="Path to the sync health status JSON file.",
    )
    parser.add_argument(
        "--protocol-file",
        default=DEFAULT_PROTOCOL_FILE,
        help="Path to the OpenClaw activity protocol JSON file.",
    )
    return parser.parse_args()


def main() -> int:
    configure_console_streams()
    args = parse_args()
    watcher = OpenClawSessionWatcher(
        sessions_json=args.sessions_json,
        session_key=args.session_key,
        poll_interval=args.poll_interval,
        bootstrap_current=args.bootstrap_current,
        bootstrap_max_age_seconds=args.bootstrap_max_age_seconds,
        status_file=args.status_file,
        protocol_file=args.protocol_file,
    )
    return watcher.run()


if __name__ == "__main__":
    raise SystemExit(main())
