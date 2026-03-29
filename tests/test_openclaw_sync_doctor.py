import tempfile
import unittest
from pathlib import Path
from unittest import mock

import openclaw_sync_doctor as doctor


class BoardPortTests(unittest.TestCase):
    def test_reads_port_from_runtime_file_when_present(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            port_file = Path(temp_dir) / "board-port.txt"
            port_file.write_text("18802", encoding="utf-8")
            with mock.patch.object(doctor, "BOARD_PORT_FILE", port_file):
                self.assertEqual(doctor.read_board_port(), 18802)

    def test_falls_back_to_default_port_when_runtime_file_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            port_file = Path(temp_dir) / "board-port.txt"
            with mock.patch.object(doctor, "BOARD_PORT_FILE", port_file):
                self.assertEqual(doctor.read_board_port(), doctor.DEFAULT_BOARD_PORT)


class BackendCandidateTests(unittest.TestCase):
    def test_candidates_use_runtime_port(self) -> None:
        with mock.patch.object(doctor, "read_board_port", return_value=18803):
            with mock.patch("socket.gethostname", return_value="demo-host"):
                with mock.patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("10.20.0.1", 0))]):
                    candidates = doctor.backend_url_candidates()

        self.assertEqual(
            candidates,
            [
                "http://127.0.0.1:18803/health",
                "http://10.20.0.1:18803/health",
            ],
        )


if __name__ == "__main__":
    unittest.main()
