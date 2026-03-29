import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import python_runtime


class ResolveRepoPythonTests(unittest.TestCase):
    def test_prefers_repo_dot_venv_python_on_windows_layout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            venv_python = repo_root / ".venv" / "Scripts" / "python.exe"
            venv_python.parent.mkdir(parents=True)
            venv_python.write_text("", encoding="utf-8")

            resolved = python_runtime.resolve_repo_python(
                repo_root,
                preferred_python=r"C:\Python313\python.exe",
            )

            self.assertEqual(resolved, str(venv_python))

    def test_falls_back_to_preferred_python_when_repo_has_no_venv(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)

            resolved = python_runtime.resolve_repo_python(repo_root, preferred_python=sys.executable)

            self.assertEqual(resolved, sys.executable)

    def test_prefers_candidate_that_has_required_modules_when_preferred_python_does_not(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo_root = Path(tmp)
            preferred_python = str(repo_root / "preferred-python.exe")
            working_python = str(repo_root / "working-python.exe")
            Path(preferred_python).write_text("", encoding="utf-8")
            Path(working_python).write_text("", encoding="utf-8")

            with mock.patch.object(
                python_runtime,
                "_iter_discovered_python_candidates",
                return_value=[preferred_python, working_python],
            ):
                with mock.patch.object(
                    python_runtime,
                    "_python_supports_modules",
                    side_effect=lambda candidate, modules: candidate == working_python,
                ):
                    resolved = python_runtime.resolve_repo_python(
                        repo_root,
                        preferred_python=preferred_python,
                        required_modules=("flask",),
                    )

        self.assertEqual(resolved, working_python)


if __name__ == "__main__":
    unittest.main()
