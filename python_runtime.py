#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent


def _venv_python_candidates(repo_root: Path) -> list[Path]:
    candidates: list[Path] = []
    for name in (".venv", "venv", "env"):
        base = repo_root / name
        candidates.append(base / "Scripts" / "python.exe")
        candidates.append(base / "bin" / "python")
    return candidates


def _active_virtualenv_python() -> Path | None:
    virtual_env = os.environ.get("VIRTUAL_ENV")
    if not virtual_env:
        return None
    base = Path(virtual_env)
    for candidate in (base / "Scripts" / "python.exe", base / "bin" / "python"):
        if candidate.exists():
            return candidate
    return None


def _candidate_probe_command(candidate: str) -> list[str]:
    candidate_path = Path(candidate)
    if candidate_path.name.lower() in {"py", "py.exe"}:
        return [candidate, "-3"]
    return [candidate]


def _python_supports_modules(candidate: str, modules: tuple[str, ...]) -> bool:
    if not modules:
        return True
    probe = (
        "import importlib.util, sys; "
        "missing=[name for name in sys.argv[1:] if importlib.util.find_spec(name) is None]; "
        "raise SystemExit(0 if not missing else 1)"
    )
    completed = subprocess.run(
        _candidate_probe_command(candidate) + ["-c", probe, *modules],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return completed.returncode == 0


def _append_candidate(candidates: list[str], seen: set[str], candidate: str | None) -> None:
    if not candidate:
        return
    expanded = str(Path(candidate).expanduser())
    key = expanded.casefold()
    if key in seen:
        return
    if Path(expanded).exists():
        candidates.append(expanded)
        seen.add(key)


def _iter_py_launcher_candidates() -> list[str]:
    py_launcher = shutil.which("py")
    if not py_launcher:
        return []
    completed = subprocess.run(
        [py_launcher, "-0p"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    candidates: list[str] = []
    seen: set[str] = set()
    for line in (completed.stdout or "").splitlines():
        value = line.strip()
        if " *" in value:
            value = value.replace(" *", " ")
        if " " in value:
            value = value.split(" ", 1)[1].strip()
        value = value.strip()
        if value:
            _append_candidate(candidates, seen, value)
    return candidates


def _iter_discovered_python_candidates(preferred_python: str | None = None) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    _append_candidate(candidates, seen, preferred_python)

    for candidate in _iter_py_launcher_candidates():
        _append_candidate(candidates, seen, candidate)

    for command_name in ("python", "python3", "py"):
        _append_candidate(candidates, seen, shutil.which(command_name))

    return candidates


def resolve_repo_python(
    repo_root: Path,
    preferred_python: str | None = None,
    required_modules: tuple[str, ...] = (),
) -> str:
    fallback: str | None = None

    def consider(candidate: str | None) -> str | None:
        nonlocal fallback
        if not candidate:
            return None
        expanded = str(Path(candidate).expanduser())
        if not Path(expanded).exists():
            return None
        if fallback is None:
            fallback = expanded
        if _python_supports_modules(expanded, required_modules):
            return expanded
        return None

    override = os.environ.get("BROTHERHOOD_UI_PYTHON")
    if override:
        resolved = consider(override)
        if resolved:
            return resolved

    for candidate in _venv_python_candidates(repo_root):
        resolved = consider(str(candidate))
        if resolved:
            return resolved

    active_venv_python = _active_virtualenv_python()
    if active_venv_python is not None:
        resolved = consider(str(active_venv_python))
        if resolved:
            return resolved

    for candidate in _iter_discovered_python_candidates(preferred_python):
        resolved = consider(candidate)
        if resolved:
            return resolved

    if fallback:
        return fallback

    raise FileNotFoundError("Python 3 was not found for Brotherhood-UI.")


def get_runtime_python_command(
    repo_root: Path,
    preferred_python: str | None = None,
    required_modules: tuple[str, ...] = (),
) -> list[str]:
    resolved = resolve_repo_python(
        repo_root,
        preferred_python=preferred_python,
        required_modules=required_modules,
    )
    if Path(resolved).name.lower() == "py.exe" or Path(resolved).name.lower() == "py":
        return [resolved, "-3"]
    return [resolved]


def _required_modules_for_script(script_path: Path) -> tuple[str, ...]:
    script_name = script_path.name.casefold()
    if script_name in {"brotherhood_ui_launcher.py", "brotherhood_control_runtime.py", "app.py"}:
        return ("flask",)
    return ()


def run_script(script_path: str, script_args: list[str]) -> int:
    script = Path(script_path).resolve()
    repo_root = script.parent
    if repo_root.name.lower() == "backend":
        repo_root = repo_root.parent
    command = get_runtime_python_command(
        repo_root,
        preferred_python=sys.executable,
        required_modules=_required_modules_for_script(script),
    ) + [script_path] + script_args
    completed = subprocess.run(command, cwd=str(repo_root))
    return completed.returncode


def main(argv: list[str] | None = None) -> int:
    args = list(argv or sys.argv[1:])
    if not args or args[0] in {"-h", "--help", "help"}:
        print("Usage:")
        print("  python_runtime.py print-exe")
        print("  python_runtime.py run-script <script> [args...]")
        return 0

    command = args[0]
    if command == "print-exe":
        print(resolve_repo_python(REPO_ROOT, preferred_python=sys.executable))
        return 0
    if command == "run-script":
        if len(args) < 2:
            print("run-script requires a target script path.", file=sys.stderr)
            return 1
        return run_script(args[1], args[2:])

    print(f"Unknown command: {command}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
