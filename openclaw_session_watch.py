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
from dataclasses import dataclass
from typing import Any


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


def clean_user_text(raw_text: str) -> str:
    text = raw_text.strip()
    text = SENDER_BLOCK_RE.sub("", text)
    text = TIMESTAMP_LINE_RE.sub("", text)
    return text.strip()


def shorten_text(text: str, limit: int = 80) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


def tool_to_state(tool_name: str) -> str:
    lower = tool_name.lower()
    if lower in {"read", "web_search", "web_fetch", "memory_search", "memory_get"}:
        return "researching"
    if lower in {"write", "edit"}:
        return "writing"
    if lower in {"exec", "process", "browser", "sessions_spawn", "subagents"}:
        return "executing"
    if lower in {"sessions_send"}:
        return "syncing"
    return "executing"


def build_tool_note(tool_name: str, arguments: Any) -> str:
    state = tool_to_state(tool_name)
    if not isinstance(arguments, dict):
        return f"正在使用 {tool_name} 工具处理任务"

    path = None
    for key in ("path", "file_path", "filePath", "url"):
        value = arguments.get(key)
        if isinstance(value, str) and value.strip():
            path = value.strip()
            break

    query = arguments.get("query")
    command = arguments.get("command")

    if state == "researching":
        if isinstance(query, str) and query.strip():
            return f"正在检索资料：{query.strip()}"
        if path:
            return f"正在查阅资料：{path}"
        return f"正在调研并使用 {tool_name} 工具"

    if state == "writing":
        if path:
            return f"正在修改内容：{path}"
        return f"正在编写并使用 {tool_name} 工具"

    if state == "syncing":
        return f"正在同步会话：{tool_name}"

    if isinstance(command, str) and command.strip():
        return f"正在执行命令：{shorten_text(command.strip(), 60)}"
    if path:
        return f"正在处理文件：{path}"
    return f"正在执行 {tool_name} 工具"


@dataclass
class WatchState:
    session_file: str | None = None
    session_id: str | None = None
    offset: int = 0
    last_user_message_id: str | None = None
    last_assistant_message_id: str | None = None
    last_tool_call_id: str | None = None
    last_custom_error_id: str | None = None
    last_bridge_command: str | None = None
    last_bridge_value: str | None = None


class OpenClawSessionWatcher:
    def __init__(
        self,
        sessions_json: str,
        session_key: str,
        poll_interval: float,
        bootstrap_current: bool,
        bootstrap_max_age_seconds: int,
        status_file: str,
    ) -> None:
        self.sessions_json = sessions_json
        self.session_key = session_key
        self.poll_interval = poll_interval
        self.bootstrap_current = bootstrap_current
        self.bootstrap_max_age_seconds = bootstrap_max_age_seconds
        self.status_file = status_file
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
        print(f"[watch] active session -> {session_file}")

        if not os.path.exists(session_file):
            print("[watch] session file does not exist yet")
            return

        if self.bootstrap_current and self.session_is_recent():
            lines = self.read_all_lines(session_file)
            self.state.offset = os.path.getsize(session_file)
            if lines:
                self.process_record(lines[-1], bootstrap=True)
        else:
            self.state.offset = os.path.getsize(session_file)

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

    def process_message(self, record: dict[str, Any], bootstrap: bool) -> None:
        message_id = record.get("id")
        message = record.get("message")
        if not isinstance(message, dict):
            return

        role = message.get("role")
        if role == "user":
            if isinstance(message_id, str) and message_id == self.state.last_user_message_id:
                return
            text_blocks = extract_text_blocks(message.get("content"))
            if not text_blocks:
                return
            user_text = clean_user_text("\n".join(text_blocks))
            if not user_text:
                return
            self.state.last_user_message_id = message_id if isinstance(message_id, str) else None
            self.invoke_bridge("start", user_text)
            return

        if role == "assistant":
            if isinstance(message_id, str) and message_id == self.state.last_assistant_message_id:
                return

            text_blocks = extract_text_blocks(message.get("content"))
            tool_calls = extract_tool_calls(message.get("content"))

            if text_blocks and text_blocks[0].startswith("⚠️ Agent failed before reply:"):
                detail = shorten_text(text_blocks[0], 100)
                self.invoke_bridge("fail", detail)
                self.state.last_assistant_message_id = (
                    message_id if isinstance(message_id, str) else None
                )
                return

            if tool_calls:
                for tool_call in tool_calls:
                    tool_call_id = tool_call.get("id")
                    if (
                        isinstance(tool_call_id, str)
                        and tool_call_id == self.state.last_tool_call_id
                    ):
                        continue
                    tool_name = tool_call["name"]
                    note = build_tool_note(tool_name, tool_call.get("arguments"))
                    state = tool_to_state(tool_name)
                    self.invoke_bridge("phase", note, extra_args=["--state", state])
                    if isinstance(tool_call_id, str):
                        self.state.last_tool_call_id = tool_call_id
                self.state.last_assistant_message_id = (
                    message_id if isinstance(message_id, str) else None
                )
                return

            if text_blocks:
                summary = shorten_text(text_blocks[0], 100)
                self.invoke_bridge("done", summary)
                self.state.last_assistant_message_id = (
                    message_id if isinstance(message_id, str) else None
                )
                return

            if bootstrap:
                return

        if role == "toolResult" and record.get("isError") is True:
            detail = shorten_text(
                extract_text_blocks(message.get("content"))[0]
                if extract_text_blocks(message.get("content"))
                else "OpenClaw 工具执行失败",
                100,
            )
            self.invoke_bridge("fail", detail)

    def process_custom(self, record: dict[str, Any]) -> None:
        custom_type = record.get("customType")
        if custom_type != "openclaw:prompt-error":
            return

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
        self.invoke_bridge("fail", shorten_text(error.strip(), 100))

    def invoke_bridge(self, command: str, value: str, extra_args: list[str] | None = None) -> None:
        args = [sys.executable, BRIDGE_SCRIPT, command, value]
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
            "lastBridgeCommand": self.state.last_bridge_command,
            "lastBridgeValue": self.state.last_bridge_value,
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
    )
    return watcher.run()


if __name__ == "__main__":
    raise SystemExit(main())
