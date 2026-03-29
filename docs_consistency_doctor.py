#!/usr/bin/env python3
"""Check that key docs still match the current implementation."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent
README_PATH = REPO_ROOT / "README.md"
ASSET_WORKFLOW_PATH = REPO_ROOT / "docs" / "asset-workflow.md"
PLACE_ASSETS_PATH = REPO_ROOT / "frontend" / "themes" / "liangshan" / "PLACE_ASSETS_HERE.txt"
PLACE_AUDIO_PATH = REPO_ROOT / "frontend" / "themes" / "liangshan" / "audio" / "PLACE_AUDIO_HERE.txt"
MANIFEST_PATH = REPO_ROOT / "frontend" / "themes" / "liangshan" / "asset-manifest.json"
THEME_PATH = REPO_ROOT / "frontend" / "themes" / "liangshan" / "theme.json"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def state_to_english_hero(theme: dict[str, Any], state: str) -> str | None:
    if state == "idle":
        return "Song Jiang"
    subscene = (theme.get("subscenes") or {}).get(state) or {}
    hero_id = subscene.get("actorId")
    if not hero_id:
        return None
    hero_node = (theme.get("supportHeroes") or {}).get(hero_id) or {}
    label = hero_node.get("label")
    translit = {
        "吴用": "Wu Yong",
        "孫二娘": "Sun Erniang",
        "武松": "Wu Song",
        "林冲": "Lin Chong",
        "鲁智深": "Lu Zhishen",
        "魯智深": "Lu Zhishen",
    }
    return translit.get(str(label), str(label) if label else None)


def run_generator_check() -> list[str]:
    cmd = [sys.executable, str(REPO_ROOT / "generate_asset_docs.py"), "--check"]
    completed = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode == 0:
        return []
    lines = [line.strip() for line in (completed.stdout + "\n" + completed.stderr).splitlines() if line.strip()]
    return lines or ["Asset docs are out of date."]


def main() -> int:
    parser = argparse.ArgumentParser(description="Check whether docs still match current Brotherhood-UI implementation.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    args = parser.parse_args()

    theme = load_json(THEME_PATH)
    manifest = load_json(MANIFEST_PATH)
    readme = load_text(README_PATH)
    asset_workflow = load_text(ASSET_WORKFLOW_PATH)
    place_assets = load_text(PLACE_ASSETS_PATH)
    place_audio = load_text(PLACE_AUDIO_PATH)

    errors: list[str] = []
    warnings: list[str] = []

    errors.extend(run_generator_check())

    for state in ("writing", "researching", "executing", "syncing", "error"):
        hero = state_to_english_hero(theme, state)
        if not hero:
            errors.append(f"Could not resolve README hero mapping for state: {state}")
            continue
        if f"| `{state}` | {hero} |" not in readme:
            errors.append(f"README current state mapping is stale for `{state}` -> `{hero}`")

    required_readme_phrases = [
        ".\\Brotherhood-UI Launcher.bat",
        "python3 brotherhood_ui_launcher.py",
        "python brotherhood_control_runtime.py",
        "python3 brotherhood_control_runtime.py",
        "python generate_asset_docs.py",
        "python asset_delivery_doctor.py",
        "docs/asset-status.md",
        "python docs_consistency_doctor.py",
        "python check_theme_consistency.py",
        "Sun Erniang",
        "state_idle.mp3",
    ]
    for phrase in required_readme_phrases:
        if phrase not in readme:
            errors.append(f"README is missing required phrase: {phrase}")

    required_asset_workflow_phrases = [
        "python generate_asset_docs.py",
        "python asset_delivery_doctor.py",
        "python docs_consistency_doctor.py",
        "python check_theme_consistency.py",
        ".\\Brotherhood-UI Launcher.bat",
        "python3 brotherhood_ui_launcher.py",
        "brotherhood_control_runtime.py",
    ]
    for phrase in required_asset_workflow_phrases:
        if phrase not in asset_workflow:
            errors.append(f"asset-workflow.md is missing required phrase: {phrase}")

    placeholder_count = len(manifest.get("placeholderAssets") or [])
    listed_placeholder_lines = [line for line in place_assets.splitlines() if line.startswith("- `")]
    if len(listed_placeholder_lines) < placeholder_count:
        warnings.append(f"PLACE_ASSETS_HERE.txt lists fewer placeholder lines ({len(listed_placeholder_lines)}) than manifest entries ({placeholder_count}).")

    obsolete_audio_allow_markers = (
        "Do not use the old `songjiang_*.mp3` naming anymore.",
        "The old `songjiang_*.mp3` naming is obsolete in this project.",
    )
    for path, content in [
        (README_PATH, readme),
        (ASSET_WORKFLOW_PATH, asset_workflow),
        (PLACE_ASSETS_PATH, place_assets),
        (PLACE_AUDIO_PATH, place_audio),
    ]:
        if "songjiang_" in content and not any(marker in content for marker in obsolete_audio_allow_markers):
            errors.append(f"Obsolete audio naming still present in {path}")

    report = {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "placeholderCount": placeholder_count,
    }

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if not errors else 1

    print("Docs consistency doctor")
    print("=" * 32)
    print(f"Status: {'OK' if not errors else 'FAIL'}")
    print(f"Placeholder entries: {placeholder_count}")
    if errors:
        print("\nErrors:")
        for item in errors:
            print(f"- {item}")
    if warnings:
        print("\nWarnings:")
        for item in warnings:
            print(f"- {item}")
    if not errors and not warnings:
        print("\nDocs look aligned with the current implementation.")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
