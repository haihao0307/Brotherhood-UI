import unittest
from pathlib import Path
from unittest import mock

import brotherhood_control_runtime as runtime


class BoardIdentityTests(unittest.TestCase):
    def test_accepts_health_payload_from_current_repo(self) -> None:
        payload = {
            "app": "Brotherhood-UI",
            "status": "ok",
            "repoRoot": str(runtime.REPO_ROOT),
        }

        self.assertTrue(runtime.board_matches_repo(payload, runtime.REPO_ROOT))

    def test_rejects_health_payload_from_different_repo(self) -> None:
        payload = {
            "app": "Brotherhood-UI",
            "status": "ok",
            "repoRoot": str(Path(r"E:\Codex Projects\Brotherhood-UI\.worktrees\dialogue-bubble-readability")),
        }

        self.assertFalse(runtime.board_matches_repo(payload, runtime.REPO_ROOT))


class LocalBoardResolutionTests(unittest.TestCase):
    def test_prefers_localhost_when_it_becomes_healthy_within_wait_window(self) -> None:
        board_port = runtime.DEFAULT_BOARD_PORT
        health_by_url = {
            f"http://127.0.0.1:{board_port}": [False, False, True],
            f"http://10.20.0.1:{board_port}": [True, True, True],
        }

        def fake_board_healthy(url: str, timeout: int = 2) -> bool:
            results = health_by_url[url]
            if len(results) > 1:
                return results.pop(0)
            return results[0]

        time_values = iter([0.0, 0.0, 0.5, 1.0, 1.5])

        with mock.patch.object(runtime, "board_url_candidates", return_value=list(health_by_url.keys())):
            with mock.patch.object(runtime, "board_healthy", side_effect=fake_board_healthy):
                with mock.patch.object(runtime.time, "time", side_effect=lambda: next(time_values)):
                    with mock.patch.object(runtime.time, "sleep", return_value=None):
                        resolved = runtime.resolve_local_board_url(wait_seconds=2)

        self.assertEqual(resolved, f"http://127.0.0.1:{board_port}")

    def test_falls_back_to_remote_when_localhost_never_becomes_healthy(self) -> None:
        board_port = runtime.DEFAULT_BOARD_PORT
        health_by_url = {
            f"http://127.0.0.1:{board_port}": [False, False, False],
            f"http://10.20.0.1:{board_port}": [True, True, True],
        }

        def fake_board_healthy(url: str, timeout: int = 2) -> bool:
            results = health_by_url[url]
            if len(results) > 1:
                return results.pop(0)
            return results[0]

        time_values = iter([0.0, 0.0, 0.5, 1.0, 1.5])

        with mock.patch.object(runtime, "board_url_candidates", return_value=list(health_by_url.keys())):
            with mock.patch.object(runtime, "board_healthy", side_effect=fake_board_healthy):
                with mock.patch.object(runtime.time, "time", side_effect=lambda: next(time_values)):
                    with mock.patch.object(runtime.time, "sleep", return_value=None):
                        resolved = runtime.resolve_local_board_url(wait_seconds=1)

        self.assertEqual(resolved, f"http://10.20.0.1:{board_port}")


class BoardPortSelectionTests(unittest.TestCase):
    def test_prefers_default_port_when_available(self) -> None:
        with mock.patch.object(runtime, "port_available", return_value=True):
            selected_port = runtime.choose_board_port()

        self.assertEqual(selected_port, runtime.DEFAULT_BOARD_PORT)

    def test_falls_back_to_next_available_port_when_default_is_taken(self) -> None:
        def fake_port_available(port: int) -> bool:
            return port == runtime.DEFAULT_BOARD_PORT + 1

        with mock.patch.object(runtime, "port_available", side_effect=fake_port_available):
            selected_port = runtime.choose_board_port()

        self.assertEqual(selected_port, runtime.DEFAULT_BOARD_PORT + 1)


class StartBackendFailureTests(unittest.TestCase):
    def test_chooses_next_port_from_configured_runtime_port_when_busy(self) -> None:
        configured_port = runtime.DEFAULT_BOARD_PORT + 3
        selected_port = configured_port + 1

        with mock.patch.object(runtime, "read_board_port", return_value=configured_port):
            with mock.patch.object(runtime, "read_pid", return_value=None):
                with mock.patch.object(runtime, "resolve_board_url", return_value=f"http://127.0.0.1:{configured_port}"):
                    with mock.patch.object(runtime, "board_health_payload", return_value=None):
                        with mock.patch.object(runtime, "listening_pid_for_port", return_value=4567):
                            with mock.patch.object(runtime, "choose_board_port", return_value=selected_port) as choose_mock:
                                with mock.patch.object(runtime, "spawn_background", return_value=9876) as spawn_mock:
                                    with mock.patch.object(runtime, "write_pid"):
                                        with mock.patch.object(runtime, "write_board_port"):
                                            with mock.patch.object(runtime, "wait_for_repo_board", return_value=f"http://127.0.0.1:{selected_port}"):
                                                ok, message = runtime.start_backend()

        self.assertTrue(ok)
        choose_mock.assert_called_once_with(start_port=configured_port)
        spawn_mock.assert_called_once_with(
            runtime.BACKEND_SCRIPT,
            runtime.RUNTIME_DIR / "backend.log",
            extra_env={"BROTHERHOOD_UI_PORT": str(selected_port)},
        )
        self.assertIn(f"http://127.0.0.1:{selected_port}", message)

    def test_reports_backend_failure_when_spawned_process_never_becomes_healthy(self) -> None:
        with mock.patch.object(runtime, "read_pid", return_value=None):
            with mock.patch.object(runtime, "resolve_board_url", return_value=f"http://127.0.0.1:{runtime.DEFAULT_BOARD_PORT}"):
                with mock.patch.object(runtime, "board_health_payload", return_value=None):
                    with mock.patch.object(runtime, "choose_board_port", return_value=runtime.DEFAULT_BOARD_PORT):
                        with mock.patch.object(runtime, "spawn_background", return_value=9876):
                            with mock.patch.object(runtime, "write_pid"):
                                with mock.patch.object(runtime, "wait_for_repo_board", return_value=None):
                                    with mock.patch.object(runtime, "tail_runtime_log", return_value="Traceback... address already in use"):
                                        ok, message = runtime.start_backend()

        self.assertFalse(ok)
        self.assertIn("Backend failed to start", message)
        self.assertIn("address already in use", message)


if __name__ == "__main__":
    unittest.main()
