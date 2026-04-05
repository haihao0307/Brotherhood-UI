from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
import argparse

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parent
THEME_ROOT = REPO_ROOT / "frontend" / "themes" / "liangshan"
THEME_JSON = THEME_ROOT / "theme.json"


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def deep_merge(base: dict, patch: dict) -> dict:
    merged = dict(base or {})
    for key, value in (patch or {}).items():
        current = merged.get(key)
        if isinstance(current, dict) and isinstance(value, dict):
            merged[key] = deep_merge(current, value)
        elif isinstance(value, list):
            merged[key] = list(value)
        else:
            merged[key] = value
    return merged


def static_url_to_path(url: str) -> Path:
    normalized = str(url or "").strip().replace("\\", "/")
    marker = "/static/themes/liangshan/"
    if marker not in normalized:
        raise ValueError(f"unsupported asset url: {url}")
    rel = normalized.split(marker, 1)[1]
    return THEME_ROOT / rel


def normalize_asset_ref(asset) -> str | None:
    if not asset:
        return None
    if isinstance(asset, str):
        return asset
    if isinstance(asset, dict):
        return asset.get("png") or asset.get("webp") or asset.get("mp3")
    return None


def safe_list(value):
    return value if isinstance(value, list) else []


def load_theme_config(theme_path: Path) -> tuple[dict, list[str]]:
    warnings: list[str] = []
    data = load_json(theme_path)
    includes = data.get("includes")
    if isinstance(includes, dict):
        for include_name, include_ref in includes.items():
            try:
                include_path = static_url_to_path(str(include_ref or ""))
            except ValueError as exc:
                warnings.append(f"include {include_name}: {exc}")
                continue
            if not include_path.exists():
                warnings.append(f"include {include_name}: missing file {include_path}")
                continue
            include_data = load_json(include_path)
            data = deep_merge(data, include_data)
    return data, warnings


def count_dialogue_lines(node) -> int:
    if not isinstance(node, dict):
        return 0
    lines = node.get("lines")
    if isinstance(lines, list):
        return len([line for line in lines if str(line or "").strip()])
    text = str(node.get("text") or "").strip()
    return 1 if text else 0


def read_png_size(path: Path) -> tuple[int, int] | None:
    if not path.exists():
        return None
    try:
        with Image.open(path) as img:
            return int(img.width), int(img.height)
    except Exception:
        return None


def adjacent_meta_path(path: Path) -> Path:
    if path.suffix.lower() == ".png":
        return path.with_name(path.name + ".meta.json")
    return path.with_suffix(path.suffix + ".meta.json")


def load_meta(path: Path) -> dict[str, Any] | None:
    meta_path = adjacent_meta_path(path)
    if not meta_path.exists():
        return None
    try:
        return load_json(meta_path)
    except Exception:
        return None


def validate_front_overlay(node: dict[str, Any] | None, label: str, errors: list[str], warnings: list[str]) -> None:
    if not isinstance(node, dict) or node.get("enabled") is False:
        return

    if "framesPath" in node and node.get("framesPath") is not None and not isinstance(node.get("framesPath"), str):
        errors.append(f"{label}: invalid frontOverlay config")
        return
    if "filePattern" in node and node.get("filePattern") is not None and not isinstance(node.get("filePattern"), str):
        errors.append(f"{label}: invalid frontOverlay config")
        return

    frames_path = str(node.get("framesPath") or "").strip().replace("\\", "/").strip("/")
    raw_file_pattern = node.get("filePattern")
    file_pattern = raw_file_pattern.strip() if isinstance(raw_file_pattern, str) else ""
    if not file_pattern:
        file_pattern = "Front_{index}.png"
    if "{index}" not in file_pattern:
        errors.append(f"{label}: invalid frontOverlay config")
        return

    def parse_whole_number(name: str, default: int | None = None) -> int:
        if name not in node or node.get(name) is None:
            if default is not None:
                return default
            raise ValueError(name)
        raw_value = node.get(name)
        if isinstance(raw_value, bool):
            raise ValueError(name)
        numeric_value = float(raw_value)
        if not numeric_value.is_integer():
            raise ValueError(name)
        return int(numeric_value)

    try:
        start_index = parse_whole_number("startIndex", 1)
        zero_pad = parse_whole_number("zeroPad", 3)
        frame_count = parse_whole_number("frameCount")
        fps = parse_whole_number("fps")
    except (TypeError, ValueError):
        errors.append(f"{label}: invalid frontOverlay config")
        return

    if not frames_path or start_index < 1 or zero_pad < 1 or frame_count < 1 or fps < 1:
        errors.append(f"{label}: invalid frontOverlay config")
        return

    overlay_root = THEME_ROOT / frames_path
    if not overlay_root.exists() or not overlay_root.is_dir():
        errors.append(f"{label}: missing front overlay directory {overlay_root}")
        return

    for index in range(frame_count):
        frame_number = str(start_index + index).zfill(zero_pad)
        frame_name = file_pattern.replace("{index}", frame_number)
        frame_path = overlay_root / frame_name
        if not frame_path.exists():
            errors.append(f"{label}: missing front overlay frame {frame_path}")
            continue
        size = read_png_size(frame_path)
        if size != (1280, 720):
            errors.append(f"{label}: expected 1280x720 front overlay frame, got {size} for {frame_path}")


def expected_worker_state(actor_states: dict[str, Any]) -> list[str]:
    return [name for name in actor_states.keys() if name not in {"idle", "walking"}]


def expand_objects(defs):
    expanded = []
    for item in safe_list(defs):
        if not isinstance(item, dict):
            continue
        expanded.append(item)
        for dup in safe_list(item.get("duplicates")):
            if isinstance(dup, dict):
                merged = dict(item)
                merged.update({k: v for k, v in dup.items() if k != "mirrorX"})
                expanded.append(merged)
    return expanded


def analyze_theme(theme_path: Path) -> tuple[list[str], list[str], dict[str, Any]]:
    data, warnings = load_theme_config(theme_path)
    errors = []

    def require_file(asset_url: str | None, label: str):
        if not asset_url:
            errors.append(f"{label}: missing asset url")
            return None
        try:
            path = static_url_to_path(asset_url)
        except ValueError as exc:
            errors.append(f"{label}: {exc}")
            return None
        if not path.exists():
            errors.append(f"{label}: missing file {path}")
        return path

    require_file(normalize_asset_ref(data.get("assets", {}).get("bg")), "assets.bg")
    require_file(normalize_asset_ref(data.get("mainScene", {}).get("background")), "mainScene.background")
    validate_front_overlay(data.get("mainScene", {}).get("frontOverlay"), "mainScene.frontOverlay", errors, warnings)

    main_hero = data.get("mainHero", {})
    main_hero_id = str(main_hero.get("id") or "songjiang")
    support_heroes = data.get("supportHeroes", {})
    cast = data.get("mainScene", {}).get("cast", {})
    main_props_root = str(data.get("mainScene", {}).get("propsRoot") or "")
    handoff_dialogues = data.get("handoffDialogues") if isinstance(data.get("handoffDialogues"), dict) else {}
    hero_dialogues = data.get("heroDialogues") if isinstance(data.get("heroDialogues"), dict) else {}
    random_events = (
        data.get("mainScene", {}).get("randomEvents")
        if isinstance(data.get("mainScene", {}).get("randomEvents"), dict)
        else {}
    )
    audio_root = data.get("audio") if isinstance(data.get("audio"), dict) else {}
    audio_roles = audio_root.get("roles") if isinstance(audio_root.get("roles"), dict) else {}
    subscenes = data.get("subscenes") if isinstance(data.get("subscenes"), dict) else {}
    roaming = data.get("mainScene", {}).get("supportRoaming") if isinstance(data.get("mainScene", {}).get("supportRoaming"), dict) else {}

    def validate_spritesheet(asset_node: dict[str, Any], label: str):
        path = require_file(normalize_asset_ref(asset_node), label)
        if path is None:
            return None
        frame_width = int(asset_node.get("frameWidth") or 0)
        frame_height = int(asset_node.get("frameHeight") or 0)
        frames = int(asset_node.get("frames") or 0)
        if frame_width <= 0 or frame_height <= 0 or frames <= 0:
            errors.append(f"{label}: invalid frame config")
            return path
        size = read_png_size(path)
        if not size:
            errors.append(f"{label}: unable to read image size for {path}")
            return path
        width, height = size
        if width < frame_width or height < frame_height:
            errors.append(f"{label}: image {width}x{height} smaller than frame {frame_width}x{frame_height}")
            return path
        if width % frame_width != 0:
            warnings.append(f"{label}: width {width} not divisible by frameWidth {frame_width}")
        if height % frame_height != 0:
            warnings.append(f"{label}: height {height} not divisible by frameHeight {frame_height}")
        cols = max(1, width // frame_width)
        rows = max(1, height // frame_height)
        capacity = cols * rows
        if capacity < frames:
            errors.append(f"{label}: spritesheet capacity {capacity} < configured frames {frames}")
        meta = load_meta(path)
        if meta:
            meta_fw = int(meta.get("frameWidth") or 0)
            meta_fh = int(meta.get("frameHeight") or 0)
            meta_frames = int(meta.get("frames") or 0)
            if meta_fw and meta_fw != frame_width:
                warnings.append(f"{label}: meta frameWidth {meta_fw} != config {frame_width}")
            if meta_fh and meta_fh != frame_height:
                warnings.append(f"{label}: meta frameHeight {meta_fh} != config {frame_height}")
            if meta_frames and meta_frames != frames:
                warnings.append(f"{label}: meta frames {meta_frames} != config {frames}")
            source_path = str(meta.get("sourcePath") or "")
            if source_path.startswith("placeholder://"):
                warnings.append(f"{label}: still using placeholder source {source_path}")
        return path

    def validate_audio_ref(asset_url: str | None, label: str):
        path = require_file(asset_url, label)
        if path and path.suffix.lower() != ".mp3":
            warnings.append(f"{label}: expected mp3 asset, got {path.suffix}")
        return path

    for state_name, state_node in (main_hero.get("states") or {}).items():
        validate_spritesheet(state_node, f"mainHero.states.{state_name}")

    for hero_id, hero_node in support_heroes.items():
        states = hero_node.get("states") or {}
        if "idle" not in states:
            errors.append(f"supportHeroes.{hero_id}: missing idle state")
        if "walking" not in states:
            errors.append(f"supportHeroes.{hero_id}: missing walking state required by main-scene roaming")
        worker_states = expected_worker_state(states)
        if len(worker_states) != 1:
            errors.append(f"supportHeroes.{hero_id}: expected exactly one working state besides idle/walking, got {worker_states}")
        for state_name, state_node in states.items():
            validate_spritesheet(state_node, f"supportHeroes.{hero_id}.states.{state_name}")
        if hero_id not in cast:
            errors.append(f"mainScene.cast: missing support hero slot for {hero_id}")

        hero_dialogue_node = hero_dialogues.get(hero_id)
        if not isinstance(hero_dialogue_node, dict):
            errors.append(f"heroDialogues.{hero_id}: missing hero dialogue node")
            continue
        idle_count = count_dialogue_lines(hero_dialogue_node.get("idle"))
        if idle_count < 20:
            errors.append(f"heroDialogues.{hero_id}.idle: expected at least 20 lines, got {idle_count}")

    main_hero_dialogue = hero_dialogues.get(main_hero_id)
    if not isinstance(main_hero_dialogue, dict):
        errors.append(f"heroDialogues.{main_hero_id}: missing main hero dialogue node")
    else:
        idle_count = count_dialogue_lines(main_hero_dialogue.get("idle"))
        if idle_count < 20:
            errors.append(f"heroDialogues.{main_hero_id}.idle: expected at least 20 lines, got {idle_count}")

    if main_hero_id not in cast:
        errors.append(f"mainScene.cast: missing main hero slot for {main_hero_id}")

    spritesheets = data.get("assets", {}).get("spritesheets", {})
    for sprite_key, sprite_node in spritesheets.items():
        validate_spritesheet(sprite_node, f"assets.spritesheets.{sprite_key}")

    for obj in expand_objects(data.get("objects")):
        sprite_key = obj.get("key")
        if not sprite_key:
            continue
        sprite_node = spritesheets.get(sprite_key)
        if not sprite_node:
            errors.append(f"main objects: missing spritesheet asset {sprite_key}")
            continue
        path = require_file(normalize_asset_ref(sprite_node), f"main object asset {sprite_key}")
        if path and main_props_root:
            scope = str((THEME_ROOT / main_props_root).resolve())
            if scope not in str(path.resolve()):
                errors.append(f"main object asset {sprite_key} must live under {main_props_root}, got {path}")

    for state_name, subscene in (data.get("subscenes") or {}).items():
        validate_front_overlay(subscene.get("frontOverlay"), f"subscenes.{state_name}.frontOverlay", errors, warnings)
        actor_id = str(subscene.get("actorId") or "")
        if actor_id != main_hero_id and actor_id not in support_heroes:
            errors.append(f"subscenes.{state_name}: actorId {actor_id} does not exist")
        actor_node = main_hero if actor_id == main_hero_id else support_heroes.get(actor_id, {})
        actor_states = actor_node.get("states") or {}
        animation_state = str(subscene.get("animationState") or state_name)
        if animation_state not in actor_states:
            errors.append(f"subscenes.{state_name}: actor {actor_id} missing state {animation_state}")
        handoff_node = handoff_dialogues.get(state_name)
        if not isinstance(handoff_node, dict) or count_dialogue_lines(handoff_node) <= 0:
            errors.append(f"handoffDialogues.{state_name}: missing dialogue lines")
        hero_dialogue_node = hero_dialogues.get(actor_id) if isinstance(hero_dialogues, dict) else None
        if not isinstance(hero_dialogue_node, dict):
            errors.append(f"heroDialogues.{actor_id}: missing node for subscene {state_name}")
        else:
            worker_count = count_dialogue_lines(hero_dialogue_node.get(animation_state))
            if worker_count < 20:
                errors.append(
                    f"heroDialogues.{actor_id}.{animation_state}: expected at least 20 lines, got {worker_count}"
                )
        bg_path = require_file(normalize_asset_ref(subscene.get("background")), f"subscenes.{state_name}.background")
        if bg_path:
            bg_size = read_png_size(bg_path)
            if not bg_size:
                errors.append(f"subscenes.{state_name}.background: unable to read image size")
        props_root = str(subscene.get("propsRoot") or "")
        props_dir = (THEME_ROOT / props_root) if props_root else None
        if props_root and not props_dir.exists():
            warnings.append(f"subscenes.{state_name}: props root does not exist yet: {props_dir}")
        for obj in expand_objects(subscene.get("objects")):
            sprite_key = obj.get("key")
            if not sprite_key:
                continue
            sprite_node = spritesheets.get(sprite_key)
            if not sprite_node:
                errors.append(f"subscenes.{state_name}.objects: missing spritesheet asset {sprite_key}")
                continue
            path = require_file(normalize_asset_ref(sprite_node), f"subscenes.{state_name} object asset {sprite_key}")
            if path and props_root:
                scope = str((THEME_ROOT / props_root).resolve())
                if scope not in str(path.resolve()):
                    errors.append(f"subscenes.{state_name} object asset {sprite_key} must live under {props_root}, got {path}")

    placeholder_files = [
        THEME_ROOT / "wuyong_walking-spritesheet.png",
        THEME_ROOT / "sunerniang_walking-spritesheet.png",
        THEME_ROOT / "wusong_walking-spritesheet.png",
        THEME_ROOT / "linchong_walking-spritesheet.png",
        THEME_ROOT / "luzhishen_walking-spritesheet.png",
    ]
    for path in placeholder_files:
        if not path.exists():
            errors.append(f"placeholder walking asset missing: {path}")

    hero_styles = random_events.get("heroStyles") if isinstance(random_events.get("heroStyles"), dict) else {}
    expected_event_heroes = [main_hero_id] + list(support_heroes.keys())
    for hero_id in expected_event_heroes:
        if hero_id not in hero_styles:
            warnings.append(f"mainScene.randomEvents.heroStyles: missing style for {hero_id}")
    if random_events.get("enabled") is True:
        pool_interval = random_events.get("intervalMs")
        if not isinstance(pool_interval, list) or len(pool_interval) < 2:
            errors.append("mainScene.randomEvents.intervalMs: expected [min,max] array")

    # Audio semantic checks: every cast hero should have idle audio; every worker should have its working state's audio.
    for hero_id in expected_event_heroes:
        role_node = audio_roles.get(hero_id)
        if not isinstance(role_node, dict):
            warnings.append(f"audio.roles.{hero_id}: missing role audio mapping")
            continue
        role_states = role_node.get("states") if isinstance(role_node.get("states"), dict) else {}
        if "idle" not in role_states:
            warnings.append(f"audio.roles.{hero_id}.states.idle: missing idle audio mapping")
        else:
            validate_audio_ref(normalize_asset_ref(role_states.get("idle")), f"audio.roles.{hero_id}.states.idle")
        if hero_id in support_heroes:
            worker_state = expected_worker_state((support_heroes.get(hero_id) or {}).get("states") or {})
            if worker_state:
                state_name = worker_state[0]
                if state_name not in role_states:
                    warnings.append(f"audio.roles.{hero_id}.states.{state_name}: missing working audio mapping")
                else:
                    validate_audio_ref(
                        normalize_asset_ref(role_states.get(state_name)),
                        f"audio.roles.{hero_id}.states.{state_name}",
                    )

    # Main cast semantic checks: support heroes should form a readable row behind Song Jiang, not collapse into overlapping x slots.
    main_cast = cast if isinstance(cast, dict) else {}
    if main_hero_id in main_cast:
        songjiang_y = float((main_cast.get(main_hero_id) or {}).get("y") or 0)
        support_positions = []
        for hero_id in support_heroes:
            node = main_cast.get(hero_id)
            if not isinstance(node, dict):
                continue
            support_positions.append((hero_id, float(node.get("x") or 0), float(node.get("y") or 0)))
            if float(node.get("y") or 0) >= songjiang_y:
                warnings.append(f"mainScene.cast.{hero_id}: expected support hero behind Song Jiang (y < {songjiang_y})")
        support_positions.sort(key=lambda item: item[1])
        min_gap = float(roaming.get("minTargetSeparationPx") or 105)
        for index in range(1, len(support_positions)):
            prev = support_positions[index - 1]
            current = support_positions[index]
            gap = current[1] - prev[1]
            if gap < min_gap:
                warnings.append(
                    f"mainScene.cast spacing: {prev[0]} and {current[0]} only {gap:.1f}px apart (< {min_gap}px)"
                )

    # Subscene mapping closure: every support hero working state should have exactly one matching subscene.
    subscene_matches: dict[str, list[str]] = {}
    for state_name, subscene in subscenes.items():
        actor_id = str(subscene.get("actorId") or "")
        animation_state = str(subscene.get("animationState") or state_name)
        subscene_matches.setdefault(f"{actor_id}:{animation_state}", []).append(state_name)
    for hero_id, hero_node in support_heroes.items():
        states = hero_node.get("states") or {}
        for worker_state in expected_worker_state(states):
            matches = subscene_matches.get(f"{hero_id}:{worker_state}", [])
            if len(matches) != 1:
                errors.append(
                    f"subscene mapping: expected exactly one subscene for {hero_id}:{worker_state}, got {matches}"
                )

    summary = {
        "themePath": str(theme_path),
        "supportHeroCount": len(support_heroes),
        "subsceneCount": len(subscenes),
        "spritesheetCount": len(spritesheets),
        "mainObjectCount": len(expand_objects(data.get("objects"))),
    }
    return errors, warnings, summary


def check(theme_path: Path, json_output: bool = False, warnings_as_errors: bool = False) -> int:
    errors, warnings, summary = analyze_theme(theme_path)
    effective_errors = list(errors)
    if warnings_as_errors:
        effective_errors.extend([f"[warning-as-error] {line}" for line in warnings])

    if json_output:
        print(
            json.dumps(
                {
                    "ok": not effective_errors,
                    "errors": errors,
                    "warnings": warnings,
                    "summary": summary,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0 if not effective_errors else 1

    if effective_errors:
        print("Theme consistency check failed:")
        for line in errors:
            print(f"ERROR: {line}")
        for line in warnings:
            print(f"WARNING: {line}")
        return 1

    print("Theme consistency check passed.")
    print(
        f"Summary: supportHeroes={summary['supportHeroCount']}, "
        f"subscenes={summary['subsceneCount']}, "
        f"spritesheets={summary['spritesheetCount']}, "
        f"mainObjects={summary['mainObjectCount']}"
    )
    for line in warnings:
        print(f"WARNING: {line}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate Brotherhood-UI theme configuration and assets.")
    parser.add_argument("--theme", default=str(THEME_JSON), help="Path to the root theme.json file.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    parser.add_argument("--warnings-as-errors", action="store_true", help="Treat warnings as failures.")
    args = parser.parse_args()
    sys.exit(check(Path(args.theme), json_output=args.json, warnings_as_errors=args.warnings_as_errors))
