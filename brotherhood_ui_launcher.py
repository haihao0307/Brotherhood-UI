#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import threading
import time
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import messagebox, scrolledtext

from python_runtime import get_runtime_python_command


REPO_ROOT = Path(__file__).resolve().parent
IS_WINDOWS = platform.system().lower().startswith("win")
CONTROL_RUNTIME = REPO_ROOT / "brotherhood_control_runtime.py"
ICON = REPO_ROOT / "logo.ico"
DEFAULT_BOARD_PORT = 18791
BOARD_PORT_FILE = REPO_ROOT / ".runtime" / "board-port.txt"


def _adjust_hex_color(color: str, delta: int) -> str:
    color = color.lstrip("#")
    channels = [int(color[i : i + 2], 16) for i in range(0, 6, 2)]
    adjusted = [max(0, min(255, value + delta)) for value in channels]
    return "#" + "".join(f"{value:02x}" for value in adjusted)


def get_launcher_action_plan(action: str) -> tuple[list[str], bool]:
    normalized = (action or "").strip().lower()
    if normalized == "auto":
        return ["serve", "watch"], True
    if normalized == "open":
        return [], True
    return [normalized], False


def read_runtime_board_port(default_port: int = DEFAULT_BOARD_PORT) -> int:
    try:
        value = int(BOARD_PORT_FILE.read_text(encoding="utf-8").strip())
        if 1 <= value <= 65535:
            return value
    except Exception:
        pass
    return default_port


def get_local_board_url(port: int | None = None) -> str:
    board_port = port if port is not None else read_runtime_board_port()
    return f"http://127.0.0.1:{board_port}"


def local_board_ready(url: str | None = None, timeout_seconds: int = 2) -> bool:
    target_url = url or get_local_board_url()
    try:
        with urllib.request.urlopen(target_url.rstrip("/") + "/health", timeout=timeout_seconds) as response:
            if response.status < 200 or response.status >= 300:
                return False
            payload = json.loads(response.read().decode("utf-8"))
            return payload.get("app") == "Brotherhood-UI" and payload.get("status") == "ok"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return False


def wait_for_local_board(timeout_seconds: int = 6, poll_interval_seconds: float = 0.5) -> str | None:
    deadline = time.monotonic() + timeout_seconds
    while True:
        target_url = get_local_board_url()
        if local_board_ready(target_url):
            return target_url
        if time.monotonic() >= deadline:
            return None
        time.sleep(poll_interval_seconds)


class ColorButton(tk.Label):
    def __init__(self, parent: tk.Widget, text: str, command, color: str) -> None:
        self.command = command
        self.normal_bg = color
        self.hover_bg = _adjust_hex_color(color, 18)
        self.disabled_bg = "#3a3a3a"
        self.enabled = True
        super().__init__(
            parent,
            text=text,
            font=("Segoe UI", 10, "bold"),
            bg=self.normal_bg,
            fg="white",
            padx=18,
            pady=10,
            cursor="hand2",
            bd=0,
            relief="flat",
        )
        self.bind("<Button-1>", self._on_click)
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)

    def set_enabled(self, enabled: bool) -> None:
        self.enabled = enabled
        if enabled:
            self.configure(bg=self.normal_bg, fg="white", cursor="hand2")
        else:
            self.configure(bg=self.disabled_bg, fg="#cfcfcf", cursor="arrow")

    def _on_click(self, _event) -> None:
        if self.enabled:
            self.command()

    def _on_enter(self, _event) -> None:
        if self.enabled:
            self.configure(bg=self.hover_bg)

    def _on_leave(self, _event) -> None:
        if self.enabled:
            self.configure(bg=self.normal_bg)


class LauncherApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Brotherhood-UI Launcher")
        self.root.geometry("760x520")
        self.root.minsize(720, 460)
        self.root.configure(bg="#161616")

        if ICON.exists():
            try:
                self.root.iconbitmap(default=str(ICON))
            except Exception:
                pass

        self.status_var = tk.StringVar(value="Ready")
        self.busy = False

        self._build_ui()

    def _build_ui(self) -> None:
        container = tk.Frame(self.root, bg="#161616", padx=20, pady=18)
        container.pack(fill="both", expand=True)

        title = tk.Label(
            container,
            text="Brotherhood-UI Launcher",
            font=("Segoe UI", 18, "bold"),
            fg="#f2d680",
            bg="#161616",
        )
        title.pack(anchor="w")

        subtitle = tk.Label(
            container,
            text="One place for Start, Check, Open, and Stop.",
            font=("Segoe UI", 10),
            fg="#d3d3d3",
            bg="#161616",
        )
        subtitle.pack(anchor="w", pady=(4, 16))

        button_bar = tk.Frame(container, bg="#161616")
        button_bar.pack(fill="x", pady=(0, 14))

        self.start_button = self._make_button(button_bar, "Start", self.start_system, "#0f766e")
        self.check_button = self._make_button(button_bar, "Check", self.check_system, "#2563eb")
        self.open_button = self._make_button(button_bar, "Open Board", self.open_board, "#7c3aed")
        self.stop_button = self._make_button(button_bar, "Stop", self.stop_system, "#b91c1c")

        self.start_button.pack(side="left", padx=(0, 10))
        self.check_button.pack(side="left", padx=(0, 10))
        self.open_button.pack(side="left", padx=(0, 10))
        self.stop_button.pack(side="left")

        status_frame = tk.Frame(container, bg="#161616")
        status_frame.pack(fill="x", pady=(0, 10))

        tk.Label(
            status_frame,
            text="Status:",
            font=("Segoe UI", 10, "bold"),
            fg="#f2d680",
            bg="#161616",
        ).pack(side="left")

        tk.Label(
            status_frame,
            textvariable=self.status_var,
            font=("Consolas", 10),
            fg="#f5f5f5",
            bg="#161616",
        ).pack(side="left", padx=(8, 0))

        hint = tk.Label(
            container,
            text="Use Start for normal use. Use Check if the board does not move. Use Stop when you are done.",
            font=("Segoe UI", 9),
            fg="#bdbdbd",
            bg="#161616",
        )
        hint.pack(anchor="w", pady=(0, 8))

        self.log = scrolledtext.ScrolledText(
            container,
            wrap="word",
            font=("Consolas", 10),
            bg="#0b0f14",
            fg="#e5e7eb",
            insertbackground="#e5e7eb",
            relief="flat",
            borderwidth=0,
            padx=12,
            pady=12,
        )
        self.log.pack(fill="both", expand=True)
        self.log.insert("end", "Launcher ready.\n")
        self.log.configure(state="disabled")

    def _make_button(self, parent: tk.Widget, text: str, command, color: str) -> ColorButton:
        return ColorButton(parent, text, command, color)

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy
        for button in (self.start_button, self.check_button, self.open_button, self.stop_button):
            button.set_enabled(not busy)

    def _append_log(self, text: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", text.rstrip() + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _run_command(self, action: str, success_status: str, failure_status: str) -> None:
        if self.busy:
            return

        self._set_busy(True)
        self.status_var.set(f"Running {action}...")
        runtime_actions, open_local_board = get_launcher_action_plan(action)

        def worker() -> None:
            try:
                for runtime_action in runtime_actions:
                    self.root.after(0, lambda runtime_action=runtime_action: self._append_log(f"> {CONTROL_RUNTIME.name} {runtime_action}"))
                    command = get_runtime_python_command(
                        REPO_ROOT,
                        preferred_python=sys.executable,
                        required_modules=("flask",),
                    ) + [
                        str(CONTROL_RUNTIME),
                        runtime_action,
                    ]
                    completed = subprocess.run(
                        command,
                        cwd=str(REPO_ROOT),
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        env={**os.environ, "PYTHONUTF8": "1"},
                    )
                    stdout = completed.stdout.strip()
                    stderr = completed.stderr.strip()
                    if stdout:
                        self.root.after(0, lambda stdout=stdout: self._append_log(stdout))
                    if stderr:
                        self.root.after(0, lambda stderr=stderr: self._append_log(stderr))
                    if completed.returncode != 0:
                        self.root.after(0, lambda: self.status_var.set(failure_status))
                        self.root.after(0, lambda: messagebox.showerror("Brotherhood-UI Launcher", f"{action} failed."))
                        return

                if open_local_board:
                    local_url = wait_for_local_board()
                    target_url = local_url or get_local_board_url()
                    opened = webbrowser.open(target_url)
                    self.root.after(0, lambda target_url=target_url: self._append_log(f"Opened browser: {target_url}"))
                    if not opened:
                        self.root.after(0, lambda target_url=target_url: self._append_log(f"Open this URL manually: {target_url}"))

                self.root.after(0, lambda: self.status_var.set(success_status))
            except Exception as exc:
                self.root.after(0, lambda: self._append_log(str(exc)))
                self.root.after(0, lambda: self.status_var.set(failure_status))
                self.root.after(0, lambda: messagebox.showerror("Brotherhood-UI Launcher", str(exc)))
            finally:
                self.root.after(0, lambda: self._set_busy(False))

        threading.Thread(target=worker, daemon=True).start()

    def start_system(self) -> None:
        self._run_command("auto", "System started", "Start failed")

    def check_system(self) -> None:
        self._run_command("doctor", "Check complete", "Check failed")

    def open_board(self) -> None:
        self._run_command("open", "Board opened", "Open failed")

    def stop_system(self) -> None:
        self._run_command("stop", "System stopped", "Stop failed")


def main() -> int:
    if not CONTROL_RUNTIME.exists():
        messagebox.showerror("Brotherhood-UI Launcher", f"Missing file: {CONTROL_RUNTIME}")
        return 1

    root = tk.Tk()
    app = LauncherApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
