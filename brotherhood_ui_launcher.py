#!/usr/bin/env python3
from __future__ import annotations

import os
import platform
import subprocess
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, scrolledtext


REPO_ROOT = Path(__file__).resolve().parent
IS_WINDOWS = platform.system().lower().startswith("win")
CLI_HELPER = REPO_ROOT / ("brotherhood-ui.bat" if IS_WINDOWS else "brotherhood-ui.sh")
ICON = REPO_ROOT / "logo.ico"


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

    def _make_button(self, parent: tk.Widget, text: str, command, color: str) -> tk.Button:
        return tk.Button(
            parent,
            text=text,
            command=command,
            font=("Segoe UI", 10, "bold"),
            bg=color,
            fg="white",
            activebackground=color,
            activeforeground="white",
            relief="flat",
            padx=18,
            pady=10,
            cursor="hand2",
        )

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy
        state = "disabled" if busy else "normal"
        for button in (self.start_button, self.check_button, self.open_button, self.stop_button):
            button.configure(state=state)

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
        helper_name = CLI_HELPER.name
        self._append_log(f"> {helper_name} {action}")

        def worker() -> None:
            try:
                if IS_WINDOWS:
                    command = ["cmd", "/c", str(CLI_HELPER), action]
                else:
                    command = ["bash", str(CLI_HELPER), action]
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
                    self.root.after(0, lambda: self._append_log(stdout))
                if stderr:
                    self.root.after(0, lambda: self._append_log(stderr))
                if completed.returncode == 0:
                    self.root.after(0, lambda: self.status_var.set(success_status))
                else:
                    self.root.after(0, lambda: self.status_var.set(failure_status))
                    self.root.after(0, lambda: messagebox.showerror("Brotherhood-UI Launcher", f"{action} failed."))
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
    if not CLI_HELPER.exists():
        messagebox.showerror("Brotherhood-UI Launcher", f"Missing file: {CLI_HELPER}")
        return 1

    root = tk.Tk()
    app = LauncherApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
