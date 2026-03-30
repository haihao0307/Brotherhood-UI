import tempfile
import unittest
from pathlib import Path
from unittest import mock

import openclaw_session_watch as watcher_module


class OpenClawSessionWatcherTests(unittest.TestCase):
    def make_watcher(self) -> watcher_module.OpenClawSessionWatcher:
        with tempfile.TemporaryDirectory() as temp_dir:
            status_file = Path(temp_dir) / "openclaw-sync-status.json"
            watcher = watcher_module.OpenClawSessionWatcher(
                sessions_json=str(Path(temp_dir) / "sessions.json"),
                session_key="agent:main:main",
                poll_interval=0.2,
                bootstrap_current=False,
                bootstrap_max_age_seconds=60,
                status_file=str(status_file),
                protocol_file=watcher_module.DEFAULT_PROTOCOL_FILE,
            )
        return watcher

    def test_tool_result_clears_pending_tool_call_when_tool_call_id_is_in_message(self) -> None:
        watcher = self.make_watcher()
        bridge_calls: list[tuple[str, str]] = []

        with mock.patch.object(
            watcher,
            "invoke_bridge",
            side_effect=lambda command, value, **_: bridge_calls.append((command, value)),
        ):
            watcher.process_message(
                {
                    "id": "user-1",
                    "message": {
                        "role": "user",
                        "content": [{"type": "text", "text": "先研究这个产品的两个亮点"}],
                    },
                },
                bootstrap=False,
            )
            watcher.process_message(
                {
                    "id": "assistant-tools-1",
                    "message": {
                        "role": "assistant",
                        "content": [
                            {
                                "type": "toolCall",
                                "id": "call-read-1",
                                "name": "read",
                                "arguments": {"path": r"C:\demo\MEMORY.md"},
                            }
                        ],
                    },
                },
                bootstrap=False,
            )
            watcher.process_message(
                {
                    "id": "tool-result-1",
                    "parentId": "assistant-tools-1",
                    "message": {
                        "role": "toolResult",
                        "toolCallId": "call-read-1",
                        "toolName": "read",
                        "content": [{"type": "text", "text": "memory"}],
                    },
                },
                bootstrap=False,
            )
            watcher.process_message(
                {
                    "id": "assistant-final-1",
                    "message": {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "亮点一：角色切换；亮点二：单屏舞台。"}],
                    },
                },
                bootstrap=False,
            )

        self.assertEqual(watcher.state.pending_tool_call_ids, set())
        self.assertEqual(
            bridge_calls,
            [
                ("start", "先研究这个产品的两个亮点"),
                ("phase", r"正在查閱資料：C:\demo\MEMORY.md"),
                ("done", "亮点一：角色切换；亮点二：单屏舞台。"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
