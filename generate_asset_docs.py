#!/usr/bin/env python3
"""Generate asset delivery docs from the manifest and current theme config."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent
THEME_DIR = REPO_ROOT / "frontend" / "themes" / "liangshan"
MANIFEST_PATH = THEME_DIR / "asset-manifest.json"
PLACE_ASSETS_PATH = THEME_DIR / "PLACE_ASSETS_HERE.txt"
PLACE_AUDIO_PATH = THEME_DIR / "audio" / "PLACE_AUDIO_HERE.txt"
THEME_PATH = THEME_DIR / "theme.json"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def render_place_assets(manifest: dict[str, Any]) -> str:
    placeholder_assets = manifest.get("placeholderAssets") or []
    workflow = manifest.get("workflow") or {}
    generate_docs_command = workflow.get("generateDocsCommand") or "python generate_asset_docs.py"
    doctor_command = workflow.get("doctorCommand") or "python asset_delivery_doctor.py"
    docs_consistency_command = workflow.get("docsConsistencyCommand") or "python docs_consistency_doctor.py"
    consistency_command = workflow.get("consistencyCommand") or "python check_theme_consistency.py"
    status_report_path = workflow.get("statusReportPath") or "docs/asset-status.md"
    lines = [
        "Brotherhood-UI asset replacement guide",
        "",
        "This file is auto-generated from:",
        "- frontend/themes/liangshan/asset-manifest.json",
        "",
        "Use this fixed workflow every time you replace art:",
        "",
        "1. Overwrite the target file in-place with the same filename.",
        f"2. Run: `{doctor_command}`",
        f"3. Open `{status_report_path}` and read the generated status board.",
        f"4. Run: `{docs_consistency_command}`",
        f"5. Run: `{consistency_command}`",
        "6. If you replaced a spritesheet and its frame size / frame count changed, sync `theme.json` again.",
        "",
        "Current scene layout",
        "",
        "- Main scene props: `frontend/themes/liangshan/props/main/`",
        "- Main scene hero spritesheets: `frontend/themes/liangshan/`",
        "- Subscene backgrounds: `frontend/themes/liangshan/subscenes/<scene>/bg.png`",
        "- Subscene props: `frontend/themes/liangshan/subscenes/<scene>/props/`",
        "- State audio: `frontend/themes/liangshan/audio/`",
        "",
        "Current placeholder files",
        "",
    ]
    for item in placeholder_assets:
        rel_path = str(item.get("path") or "")
        if not rel_path:
            continue
        lines.append(f"- `{rel_path.replace('frontend/themes/liangshan/', '')}`")
    lines.extend(
        [
            "",
            "What can usually be replaced directly",
            "",
            "- Subscene `bg.png` files",
            "- Props under `props/main/`",
            "- Props under `subscenes/<scene>/props/`",
            "",
            "What usually needs a theme sync review after replacement",
            "",
            "- Any `*_idle-spritesheet.png`",
            "- Any `*_walking-spritesheet.png`",
            "- Any support-hero working-state spritesheet",
            "",
            "Audio naming",
            "",
            "- Do not use the old `songjiang_*.mp3` naming anymore.",
            "- Use the fixed state-based names described in:",
            "  `frontend/themes/liangshan/audio/PLACE_AUDIO_HERE.txt`",
            "",
            "Recommended sprite sync entrypoints",
            "",
            "- GUI: `launch_sync_agent_theme_gui.bat`",
            "- CLI: `python sync_agent_theme.py --gui`",
            "",
            "Recommended final checks before commit",
            "",
            f"- `{generate_docs_command}`",
            f"- `{doctor_command}`",
            f"- `{status_report_path}`",
            f"- `{docs_consistency_command}`",
            f"- `{consistency_command}`",
            "",
        ]
    )
    return "\n".join(lines)


def render_place_audio(manifest: dict[str, Any], theme: dict[str, Any]) -> str:
    audio_files = [str(item).replace("frontend/themes/liangshan/audio/", "") for item in (manifest.get("stateAudioFiles") or [])]
    audio_pattern = (((theme.get("audio") or {}).get("pattern")) or "").strip()
    workflow = manifest.get("workflow") or {}
    doctor_command = workflow.get("doctorCommand") or "python asset_delivery_doctor.py"
    docs_consistency_command = workflow.get("docsConsistencyCommand") or "python docs_consistency_doctor.py"
    consistency_command = workflow.get("consistencyCommand") or "python check_theme_consistency.py"
    status_report_path = workflow.get("statusReportPath") or "docs/asset-status.md"
    lines = [
        "Put state-based theme mp3 files here (exact naming):",
        "",
    ]
    lines.extend([f"- {name}" for name in audio_files])
    lines.extend(
        [
            "",
            "Current theme convention:",
            "- filenames describe the active workflow state",
            "- they are shared by multiple heroes if you have not produced hero-specific audio yet",
            "- `theme.json` maps each hero/state to these state-based files explicitly",
            "",
            "Current theme audio pattern:",
            f"- `{audio_pattern}`" if audio_pattern else "- pattern unavailable",
            "",
            "Fixed workflow after replacing audio:",
            "",
            "1. Overwrite the file with the same name",
            f"2. Run: `{doctor_command}`",
            f"3. Open `{status_report_path}` and confirm the audio row is present.",
            f"4. Run: `{docs_consistency_command}`",
            f"5. Run: `{consistency_command}`",
            "",
            "Notes:",
            "- Audio replacement usually does not require a theme sync if the file path stays the same.",
            "- The old `songjiang_*.mp3` naming is obsolete in this project.",
            "",
            "Tip:",
            "- Keep each clip short and loop-friendly.",
            '- If browser blocks autoplay, click anywhere once or click the "音效: ON/OFF" button.',
            "",
        ]
    )
    return "\n".join(lines)


def write_if_changed(path: Path, content: str) -> bool:
    existing = path.read_text(encoding="utf-8") if path.exists() else None
    if existing == content:
        return False
    path.write_text(content, encoding="utf-8", newline="\n")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate asset delivery docs from manifest/theme.")
    parser.add_argument("--check", action="store_true", help="Only check whether generated docs are up to date.")
    args = parser.parse_args()

    manifest = load_json(MANIFEST_PATH)
    theme = load_json(THEME_PATH)
    assets_doc = render_place_assets(manifest)
    audio_doc = render_place_audio(manifest, theme)

    changed_assets = (PLACE_ASSETS_PATH.read_text(encoding="utf-8") if PLACE_ASSETS_PATH.exists() else "") != assets_doc
    changed_audio = (PLACE_AUDIO_PATH.read_text(encoding="utf-8") if PLACE_AUDIO_PATH.exists() else "") != audio_doc

    if args.check:
        if changed_assets or changed_audio:
            if changed_assets:
                print(f"OUTDATED: {PLACE_ASSETS_PATH}")
            if changed_audio:
                print(f"OUTDATED: {PLACE_AUDIO_PATH}")
            return 1
        print("Asset docs are up to date.")
        return 0

    write_if_changed(PLACE_ASSETS_PATH, assets_doc)
    write_if_changed(PLACE_AUDIO_PATH, audio_doc)
    print("Generated asset delivery docs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
