#!/usr/bin/env python3
"""Build or sync spritesheets for the Liangshan theme."""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Sequence, Tuple

try:
    from PIL import Image, ImageSequence
except Exception:  # pragma: no cover
    print("Pillow is required. Install it with: python -m pip install pillow", file=sys.stderr)
    raise


DEFAULT_FRAME_RATE = 6
DEFAULT_THEME_JSON = Path("frontend/themes/liangshan/theme.json")
MAX_TEXTURE_SIZE = 4096
PROP_SCENE_SCOPES = [
    ("main", "Main scene"),
    ("researching", "Researching subscene"),
    ("writing", "Writing subscene"),
    ("executing", "Executing subscene"),
    ("syncing", "Syncing subscene"),
    ("error", "Error subscene"),
]


def natural_sort_key(value: str) -> List[object]:
    parts = re.split(r"(\d+)", value.lower())
    result: List[object] = []
    for part in parts:
        result.append(int(part) if part.isdigit() else part)
    return result


def list_png_frames(input_dir: Path, pattern: str = "*.png") -> List[Path]:
    if not input_dir.exists():
        raise FileNotFoundError(f"input folder not found: {input_dir}")
    if not input_dir.is_dir():
        raise NotADirectoryError(f"expected a folder of PNG frames: {input_dir}")
    frame_paths = sorted(input_dir.glob(pattern), key=lambda path: natural_sort_key(path.name))
    frame_paths = [path for path in frame_paths if path.is_file()]
    if not frame_paths:
        raise ValueError(f"no PNG frames found in {input_dir} with pattern {pattern}")
    return frame_paths


def load_png_frames(frame_paths: Sequence[Path]) -> List[Image.Image]:
    images: List[Image.Image] = []
    for path in frame_paths:
        with Image.open(path) as img:
            images.append(img.convert("RGBA"))
    return images


def load_gif_frames(gif_path: Path) -> Tuple[List[Image.Image], int]:
    if not gif_path.exists():
        raise FileNotFoundError(f"gif not found: {gif_path}")
    with Image.open(gif_path) as gif:
        frames = [frame.copy().convert("RGBA") for frame in ImageSequence.Iterator(gif)]
        durations = [int(frame.info.get("duration", 100)) for frame in ImageSequence.Iterator(gif)]
    if not frames:
        raise ValueError(f"no frames found in gif: {gif_path}")
    avg_ms = int(sum(durations) / len(durations)) if durations else 100
    frame_rate = max(1, round(1000.0 / avg_ms)) if avg_ms > 0 else DEFAULT_FRAME_RATE
    return frames, frame_rate


def normalize_frames(frames: Sequence[Image.Image]) -> Tuple[List[Image.Image], int, int]:
    if not frames:
        raise ValueError("no frames to normalize")
    frame_width, frame_height = frames[0].size
    normalized: List[Image.Image] = []
    for frame in frames:
        if frame.size != (frame_width, frame_height):
            normalized.append(frame.resize((frame_width, frame_height), Image.Resampling.NEAREST))
        else:
            normalized.append(frame)
    return normalized, frame_width, frame_height


def plan_sheet_layout(
    *,
    frame_width: int,
    frame_height: int,
    frame_count: int,
    max_sheet_width: int = MAX_TEXTURE_SIZE,
    max_sheet_height: int = MAX_TEXTURE_SIZE,
) -> Tuple[int, int, int, int]:
    if frame_width <= 0 or frame_height <= 0:
        raise ValueError("frame size must be > 0")
    if frame_count <= 0:
        raise ValueError("frame_count must be > 0")

    max_cols = max_sheet_width // frame_width
    max_rows = max_sheet_height // frame_height
    if max_cols <= 0 or max_rows <= 0:
        raise ValueError(
            f"single frame {frame_width}x{frame_height} exceeds {max_sheet_width}x{max_sheet_height} texture budget"
        )

    if frame_count > max_cols * max_rows:
        raise ValueError(
            f"cannot pack {frame_count} frames of {frame_width}x{frame_height} within "
            f"{max_sheet_width}x{max_sheet_height}; reduce frame size or frame count"
        )

    cols = min(frame_count, max_cols)
    rows = (frame_count + cols - 1) // cols
    return cols, rows, cols * frame_width, rows * frame_height


def write_spritesheet(frames: Sequence[Image.Image], output_path: Path) -> dict:
    normalized, frame_width, frame_height = normalize_frames(frames)
    frame_count = len(normalized)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cols, rows, sheet_width, sheet_height = plan_sheet_layout(
        frame_width=frame_width,
        frame_height=frame_height,
        frame_count=frame_count,
    )
    sheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))
    for index, frame in enumerate(normalized):
        col = index % cols
        row = index // cols
        sheet.paste(frame, (col * frame_width, row * frame_height))
    sheet.save(output_path)
    return {
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "frames": frame_count,
        "sheetWidth": sheet_width,
        "sheetHeight": sheet_height,
        "output": str(output_path.resolve()),
    }


def meta_path_for_existing_spritesheet(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}.meta.json")


def load_existing_metadata(input_path: Path) -> dict | None:
    meta_path = meta_path_for_existing_spritesheet(input_path)
    if not meta_path.exists():
        return None
    with open(meta_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    required = {"frameWidth", "frameHeight", "frames", "sheetWidth", "sheetHeight"}
    if not isinstance(data, dict) or not required.issubset(data.keys()):
        return None
    return data


def count_contiguous_nonempty_frames(input_path: Path, *, frame_width: int, frame_height: int) -> int:
    if frame_width <= 0 or frame_height <= 0:
        raise ValueError("frame_width and frame_height must be > 0")
    with Image.open(input_path) as img:
        sheet = img.convert("RGBA")
        width, height = sheet.size
        if width % frame_width != 0 or height % frame_height != 0:
            raise ValueError(
                f"sheet size {width}x{height} is not aligned to frame size {frame_width}x{frame_height}"
            )
        cols = width // frame_width
        rows = height // frame_height
        seen_empty = False
        count = 0
        for index in range(cols * rows):
            col = index % cols
            row = index // cols
            cell = sheet.crop((
                col * frame_width,
                row * frame_height,
                (col + 1) * frame_width,
                (row + 1) * frame_height,
            ))
            has_pixels = cell.getchannel("A").getbbox() is not None
            if has_pixels:
                if seen_empty:
                    raise ValueError(
                        "existing spritesheet contains non-empty frames after empty cells; "
                        "cannot infer a contiguous frame sequence automatically"
                    )
                count += 1
            else:
                seen_empty = True
        if count <= 0:
            raise ValueError("no non-empty frames detected in spritesheet")
        return count


def iter_divisors(value: int) -> List[int]:
    divisors: List[int] = []
    for factor in range(1, int(value**0.5) + 1):
        if value % factor != 0:
            continue
        divisors.append(factor)
        partner = value // factor
        if partner != factor:
            divisors.append(partner)
    divisors.sort()
    return divisors


def infer_existing_spritesheet_candidates(input_path: Path) -> List[dict]:
    with Image.open(input_path) as img:
        width, height = img.size

    candidates: List[dict] = []
    for frame_width in iter_divisors(width):
        if frame_width < 64 or frame_width > 1024:
            continue
        for frame_height in iter_divisors(height):
            if frame_height < 64 or frame_height > 1024:
                continue
            cols = width // frame_width
            rows = height // frame_height
            total_cells = cols * rows
            if total_cells <= 1 or total_cells > 256:
                continue
            try:
                frames = count_contiguous_nonempty_frames(
                    input_path,
                    frame_width=frame_width,
                    frame_height=frame_height,
                )
            except ValueError:
                continue
            if frames <= 1:
                continue
            aspect_ratio = max(frame_width, frame_height) / min(frame_width, frame_height)
            frame_count_penalty = 0 if 4 <= frames <= 40 else min(abs(frames - 4), abs(frames - 40))
            candidates.append(
                {
                    "frameWidth": frame_width,
                    "frameHeight": frame_height,
                    "frames": frames,
                    "sheetWidth": width,
                    "sheetHeight": height,
                    "cols": cols,
                    "rows": rows,
                    "totalCells": total_cells,
                    "aspectPenalty": abs(aspect_ratio - 1.0),
                    "frameCountPenalty": frame_count_penalty,
                }
            )

    candidates.sort(
        key=lambda item: (
            item["aspectPenalty"],
            item["frameCountPenalty"],
            -item["frames"],
            item["totalCells"],
            -min(item["frameWidth"], item["frameHeight"]),
        )
    )
    return candidates


def get_theme_state_hint(
    *,
    theme_json_path: Path | None,
    target_kind: str | None,
    hero_id: str | None,
    state_key: str | None,
) -> tuple[int, int] | None:
    if not theme_json_path or not target_kind or not state_key:
        return None
    if not theme_json_path.exists():
        return None
    try:
        theme = load_theme(theme_json_path)
    except Exception:
        return None

    state_node = None
    if target_kind == "main":
        state_node = (((theme.get("mainHero") or {}).get("states")) or {}).get(state_key)
    elif target_kind == "support" and hero_id:
        state_node = ((((theme.get("supportHeroes") or {}).get(hero_id)) or {}).get("states") or {}).get(state_key)
    if not isinstance(state_node, dict):
        return None

    frame_width = state_node.get("frameWidth")
    frame_height = state_node.get("frameHeight")
    if isinstance(frame_width, int) and isinstance(frame_height, int) and frame_width > 0 and frame_height > 0:
        return int(frame_width), int(frame_height)
    return None


def inspect_existing_spritesheet(
    input_path: Path,
    frame_count: int | None,
    frame_rate: int,
    *,
    frame_width: int | None = None,
    frame_height: int | None = None,
    theme_json_path: Path | None = None,
    target_kind: str | None = None,
    hero_id: str | None = None,
    state_key: str | None = None,
) -> dict:
    existing_meta = load_existing_metadata(input_path)
    if existing_meta:
        with Image.open(input_path) as img:
            width, height = img.size
        meta_width = int(existing_meta["sheetWidth"])
        meta_height = int(existing_meta["sheetHeight"])
        if (meta_width, meta_height) != (width, height):
            existing_meta = None
        else:
            meta_frame_width = int(existing_meta["frameWidth"])
            meta_frame_height = int(existing_meta["frameHeight"])
            meta_frames = int(existing_meta["frames"])
            if (
                meta_frame_width <= 0
                or meta_frame_height <= 0
                or width % meta_frame_width != 0
                or height % meta_frame_height != 0
                or meta_frames > (width // meta_frame_width) * (height // meta_frame_height)
            ):
                existing_meta = None
    if existing_meta:
        if frame_count and int(existing_meta["frames"]) != int(frame_count):
            raise ValueError(
                f"frame_count {frame_count} does not match existing meta.json frames {existing_meta['frames']}"
            )
        return {
            "generatedAt": datetime.now().isoformat(),
            "sourceType": "spritesheet_png",
            "sourcePath": str(input_path.resolve()),
            "frameRate": int(frame_rate),
            "frameWidth": int(existing_meta["frameWidth"]),
            "frameHeight": int(existing_meta["frameHeight"]),
            "frames": int(existing_meta["frames"]),
            "sheetWidth": int(existing_meta["sheetWidth"]),
            "sheetHeight": int(existing_meta["sheetHeight"]),
            "output": str(input_path.resolve()),
            "frameFiles": None,
        }

    with Image.open(input_path) as img:
        width, height = img.size

    resolved_frame_width = None
    resolved_frame_height = None
    if frame_width and frame_height:
        resolved_frame_width = int(frame_width)
        resolved_frame_height = int(frame_height)
    else:
        hint = get_theme_state_hint(
            theme_json_path=theme_json_path,
            target_kind=target_kind,
            hero_id=hero_id,
            state_key=state_key,
        )
        if hint:
            hinted_width, hinted_height = hint
            if width % hinted_width == 0 and height % hinted_height == 0:
                resolved_frame_width = hinted_width
                resolved_frame_height = hinted_height

    if resolved_frame_width and resolved_frame_height:
        inferred_frames = count_contiguous_nonempty_frames(
            input_path,
            frame_width=resolved_frame_width,
            frame_height=resolved_frame_height,
        )
        return {
            "generatedAt": datetime.now().isoformat(),
            "sourceType": "spritesheet_png",
            "sourcePath": str(input_path.resolve()),
            "frameRate": int(frame_rate),
            "frameWidth": int(resolved_frame_width),
            "frameHeight": int(resolved_frame_height),
            "frames": int(inferred_frames),
            "sheetWidth": int(width),
            "sheetHeight": int(height),
            "output": str(input_path.resolve()),
            "frameFiles": None,
        }

    candidates = infer_existing_spritesheet_candidates(input_path)
    if candidates:
        best = candidates[0]
        if frame_count and frame_count > 0:
            matching = [item for item in candidates if int(item["frames"]) == int(frame_count)]
            if len(matching) == 1:
                best = matching[0]
            elif len(matching) > 1:
                best = matching[0]
        elif len(candidates) > 1:
            first = candidates[0]
            second = candidates[1]
            if (
                first["aspectPenalty"] == second["aspectPenalty"]
                and first["frameCountPenalty"] == second["frameCountPenalty"]
            ):
                details = ", ".join(
                    f"{item['frameWidth']}x{item['frameHeight']} => {item['frames']} frames"
                    for item in candidates[:4]
                )
                raise ValueError(
                    "existing spritesheet PNG is ambiguous without meta.json or frame size hints. "
                    f"Fill 'Frame size' or keep the .meta.json. Candidates: {details}"
                )
        return {
            "generatedAt": datetime.now().isoformat(),
            "sourceType": "spritesheet_png",
            "sourcePath": str(input_path.resolve()),
            "frameRate": int(frame_rate),
            "frameWidth": int(best["frameWidth"]),
            "frameHeight": int(best["frameHeight"]),
            "frames": int(best["frames"]),
            "sheetWidth": int(width),
            "sheetHeight": int(height),
            "output": str(input_path.resolve()),
            "frameFiles": None,
        }

    if not frame_count or frame_count <= 0:
        raise ValueError(
            "could not infer frame layout for existing spritesheet PNG. "
            "Fill 'Frame size', keep the .meta.json, or provide a reliable frame_count for a single-row strip."
        )
    if width % frame_count != 0:
        raise ValueError(
            "image width is not divisible by frame_count. "
            "If this PNG is already multi-row, fill 'Frame size' or keep its .meta.json."
        )
    frame_width = width // frame_count
    return {
        "generatedAt": datetime.now().isoformat(),
        "sourceType": "spritesheet_png",
        "sourcePath": str(input_path.resolve()),
        "frameRate": int(frame_rate),
        "frameWidth": int(frame_width),
        "frameHeight": int(height),
        "frames": int(frame_count),
        "sheetWidth": int(width),
        "sheetHeight": int(height),
        "output": str(input_path.resolve()),
        "frameFiles": None,
    }


def guess_frame_count_from_sheet(input_path: Path) -> int | None:
    existing_meta = load_existing_metadata(input_path)
    if existing_meta:
        frames = int(existing_meta.get("frames", 0))
        return frames if frames > 1 else None
    return None


def default_output_for_input(input_path: Path) -> Path:
    if input_path.is_dir():
        return input_path.parent / f"{input_path.name}-spritesheet.png"
    return input_path.with_name(f"{input_path.stem}-spritesheet.png")


def default_meta_path(output_path: Path) -> Path:
    return output_path.with_name(f"{output_path.stem}.meta.json")


def build_metadata(meta: dict, *, source_path: Path, source_type: str, frame_rate: int, frame_files: Sequence[Path] | None) -> dict:
    return {
        "generatedAt": datetime.now().isoformat(),
        "sourceType": source_type,
        "sourcePath": str(source_path.resolve()),
        "frameRate": int(frame_rate),
        "frameWidth": int(meta["frameWidth"]),
        "frameHeight": int(meta["frameHeight"]),
        "frames": int(meta["frames"]),
        "sheetWidth": int(meta["sheetWidth"]),
        "sheetHeight": int(meta["sheetHeight"]),
        "output": str(Path(meta["output"]).resolve()),
        "frameFiles": [path.name for path in frame_files] if frame_files else None,
    }


def write_metadata(metadata: dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_existing_spritesheet_metadata(metadata: dict, input_path: Path, *, write_meta: bool) -> None:
    if not write_meta:
        return
    write_metadata(metadata, meta_path_for_existing_spritesheet(input_path))


def extract_frames_from_spritesheet(
    input_path: Path,
    *,
    frame_width: int,
    frame_height: int,
    frame_count: int,
) -> List[Image.Image]:
    frames: List[Image.Image] = []
    with Image.open(input_path) as img:
        sheet = img.convert("RGBA")
        width, height = sheet.size
        if width % frame_width != 0 or height % frame_height != 0:
            raise ValueError(
                f"sheet size {width}x{height} is not aligned to frame size {frame_width}x{frame_height}"
            )
        cols = width // frame_width
        rows = height // frame_height
        if frame_count > cols * rows:
            raise ValueError(
                f"frame_count {frame_count} exceeds available cells {cols * rows} for {input_path}"
            )
        for index in range(frame_count):
            col = index % cols
            row = index // cols
            box = (
                col * frame_width,
                row * frame_height,
                (col + 1) * frame_width,
                (row + 1) * frame_height,
            )
            frames.append(sheet.crop(box))
    return frames


def repack_existing_spritesheet(
    *,
    input_path: Path,
    metadata: dict,
    write_meta: bool,
) -> dict:
    frames = extract_frames_from_spritesheet(
        input_path,
        frame_width=int(metadata["frameWidth"]),
        frame_height=int(metadata["frameHeight"]),
        frame_count=int(metadata["frames"]),
    )
    rebuilt = write_spritesheet(frames, input_path)
    updated = {
        "generatedAt": datetime.now().isoformat(),
        "sourceType": "spritesheet_png",
        "sourcePath": str(input_path.resolve()),
        "frameRate": int(metadata["frameRate"]),
        "frameWidth": int(rebuilt["frameWidth"]),
        "frameHeight": int(rebuilt["frameHeight"]),
        "frames": int(rebuilt["frames"]),
        "sheetWidth": int(rebuilt["sheetWidth"]),
        "sheetHeight": int(rebuilt["sheetHeight"]),
        "output": str(input_path.resolve()),
        "frameFiles": None,
    }
    if write_meta:
        write_metadata(updated, meta_path_for_existing_spritesheet(input_path))
    return updated


def build_spritesheet(input_path: Path, output_path: Path, pattern: str = "*.png", frame_rate: int | None = None, write_meta: bool = True) -> dict:
    input_path = input_path.resolve()
    output_path = output_path.resolve()

    if input_path.is_dir():
        frame_paths = list_png_frames(input_path, pattern)
        frames = load_png_frames(frame_paths)
        resolved_frame_rate = int(frame_rate or DEFAULT_FRAME_RATE)
        source_type = "png_frames"
    else:
        frames, gif_frame_rate = load_gif_frames(input_path)
        frame_paths = []
        resolved_frame_rate = int(frame_rate or gif_frame_rate)
        source_type = "gif"

    meta = write_spritesheet(frames, output_path)
    metadata = build_metadata(
        meta,
        source_path=input_path,
        source_type=source_type,
        frame_rate=resolved_frame_rate,
        frame_files=frame_paths,
    )
    if write_meta:
        write_metadata(metadata, default_meta_path(output_path))
    return metadata


def relative_static_path(path: Path, theme_json_path: Path) -> str:
    theme_root = theme_json_path.resolve().parent
    try:
        relative = path.resolve().relative_to(theme_root)
    except ValueError as exc:
        raise ValueError(f"spritesheet must be inside theme folder: {theme_root}") from exc
    return "/static/themes/liangshan/" + str(relative).replace("\\", "/")


def load_theme(theme_json_path: Path) -> dict:
    with open(theme_json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_theme(theme_json_path: Path, theme: dict) -> None:
    with open(theme_json_path, "w", encoding="utf-8") as f:
        json.dump(theme, f, ensure_ascii=False, indent=2)
        f.write("\n")


def strip_spritesheet_suffix(stem: str) -> str:
    for suffix in ("-spritesheet", "_spritesheet", " spritesheet"):
        if stem.endswith(suffix):
            return stem[: -len(suffix)]
    return stem


def infer_prop_key(theme: dict, theme_json_path: Path, metadata: dict) -> str | None:
    png_path = relative_static_path(Path(metadata["output"]), theme_json_path)
    spritesheets = (((theme.get("assets") or {}).get("spritesheets")) or {})
    for key, node in spritesheets.items():
        if isinstance(node, dict) and node.get("png") == png_path:
            return str(key)
    return None


def suggest_prop_key(metadata: dict) -> str:
    stem = strip_spritesheet_suffix(Path(metadata["output"]).stem).strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", stem).strip("_")
    return normalized or "prop"


def ensure_prop_spritesheet_asset(theme: dict, theme_json_path: Path, metadata: dict, prop_key: str) -> dict:
    assets = theme.setdefault("assets", {})
    spritesheets = assets.setdefault("spritesheets", {})
    if not isinstance(spritesheets, dict):
        raise ValueError("theme.assets.spritesheets is not an object")
    node = {
        "png": relative_static_path(Path(metadata["output"]), theme_json_path),
        "frameWidth": int(metadata["frameWidth"]),
        "frameHeight": int(metadata["frameHeight"]),
        "frames": int(metadata["frames"]),
        "frameRate": int(metadata["frameRate"]),
    }
    spritesheets[prop_key] = node
    return node


def collect_prop_instance_ids(base_object: dict) -> set[str]:
    used: set[str] = set()
    instance_id = base_object.get("instanceId")
    if isinstance(instance_id, str) and instance_id.strip():
        used.add(instance_id.strip())
    duplicates = base_object.get("duplicates")
    if isinstance(duplicates, list):
        for duplicate in duplicates:
            if not isinstance(duplicate, dict):
                continue
            duplicate_id = duplicate.get("instanceId")
            if isinstance(duplicate_id, str) and duplicate_id.strip():
                used.add(duplicate_id.strip())
    return used


def next_prop_instance_id(base_label: str, used_ids: set[str]) -> str:
    index = 1
    while True:
        candidate = f"{base_label}_{index:02d}"
        if candidate not in used_ids:
            return candidate
        index += 1


def infer_prop_row_step(base_object: dict, metadata: dict) -> float:
    base_x = base_object.get("x")
    positions: List[float] = []
    if isinstance(base_x, (int, float)):
        positions.append(float(base_x))
    duplicates = base_object.get("duplicates")
    if isinstance(duplicates, list):
        for duplicate in duplicates:
            if not isinstance(duplicate, dict):
                continue
            duplicate_x = duplicate.get("x")
            if isinstance(duplicate_x, (int, float)):
                positions.append(float(duplicate_x))
    positions = sorted(set(positions))
    if len(positions) >= 2:
        positive_steps = [positions[index + 1] - positions[index] for index in range(len(positions) - 1)]
        positive_steps = [step for step in positive_steps if step > 0]
        if positive_steps:
            return float(positive_steps[-1])

    frame_width = float(metadata.get("frameWidth") or 0)
    scale = base_object.get("scale")
    if isinstance(scale, (int, float)) and frame_width > 0:
        return round(max(72.0, frame_width * float(scale) * 0.9), 3)
    if frame_width > 0:
        return round(max(72.0, frame_width * 0.35), 3)
    return 120.0


def get_prop_objects_container(theme: dict, scene_scope: str) -> list:
    if scene_scope == "main":
        return theme.setdefault("objects", [])
    subscenes = theme.setdefault("subscenes", {})
    subscene = subscenes.get(scene_scope)
    if not isinstance(subscene, dict):
        raise ValueError(f"Subscene not found in theme.json: {scene_scope}")
    return subscene.setdefault("objects", [])


def find_prop_object(objects: list, prop_key: str) -> dict | None:
    return next(
        (
            obj
            for obj in objects
            if isinstance(obj, dict) and obj.get("key") == prop_key
        ),
        None,
    )


def default_prop_scale(metadata: dict) -> float:
    frame_height = float(metadata.get("frameHeight") or 0)
    if frame_height >= 512:
        return 0.42
    if frame_height >= 256:
        return 0.35
    return 0.5


def build_default_prop_object(prop_key: str, instance_label: str, metadata: dict) -> dict:
    return {
        "type": "animated",
        "key": prop_key,
        "instanceId": f"{instance_label}_00",
        "x": 640.0,
        "y": 620.0,
        "scale": default_prop_scale(metadata),
        "origin": {"x": 0.5, "y": 1.0},
        "depth": 1280,
        "clickText": instance_label,
    }


def clone_prop_base_object(source: dict, instance_label: str) -> dict:
    cloned = copy.deepcopy(source)
    cloned["instanceId"] = f"{instance_label}_00"
    cloned.pop("duplicates", None)
    return cloned


def sync_prop_object(
    *,
    theme_json_path: Path,
    metadata: dict,
    prop_key: str | None,
    duplicate_count: int,
    instance_label: str | None,
    scene_scope: str = "main",
) -> dict:
    theme = load_theme(theme_json_path)
    resolved_prop_key = prop_key or infer_prop_key(theme, theme_json_path, metadata) or suggest_prop_key(metadata)
    asset_node = ensure_prop_spritesheet_asset(theme, theme_json_path, metadata, resolved_prop_key)

    objects = get_prop_objects_container(theme, scene_scope)
    if not isinstance(objects, list):
        raise ValueError(f"Objects container for scene scope '{scene_scope}' is not a list")

    label_base = (instance_label or strip_spritesheet_suffix(Path(metadata["output"]).stem)).strip()
    if not label_base:
        label_base = resolved_prop_key

    base_object = find_prop_object(objects, resolved_prop_key)
    if not base_object:
        reference_object = find_prop_object(theme.setdefault("objects", []), resolved_prop_key)
        if reference_object:
            base_object = clone_prop_base_object(reference_object, label_base)
        else:
            base_object = build_default_prop_object(resolved_prop_key, label_base, metadata)
        objects.append(base_object)

    base_x = base_object.get("x")
    base_y = base_object.get("y")
    if not isinstance(base_x, (int, float)) or not isinstance(base_y, (int, float)):
        raise ValueError(f"Base object for prop '{resolved_prop_key}' is missing numeric x/y coordinates")

    if not isinstance(base_object.get("duplicates"), list):
        base_object["duplicates"] = []

    used_ids = collect_prop_instance_ids(base_object)
    total_duplicates = max(1, int(duplicate_count))
    row_step = infer_prop_row_step(base_object, metadata)
    existing_xs = [float(base_x)]
    for duplicate in base_object["duplicates"]:
        if isinstance(duplicate, dict) and isinstance(duplicate.get("x"), (int, float)):
            existing_xs.append(float(duplicate["x"]))
    anchor_x = max(existing_xs)

    created_nodes = []
    for index in range(total_duplicates):
        new_instance_id = next_prop_instance_id(label_base, used_ids)
        used_ids.add(new_instance_id)
        duplicate_node = {
            "instanceId": new_instance_id,
            "x": round(anchor_x + row_step * (index + 1), 3),
            "y": float(base_y),
        }
        base_object["duplicates"].append(duplicate_node)
        created_nodes.append(duplicate_node)
    save_theme(theme_json_path, theme)
    return {
        "themeJson": str(theme_json_path.resolve()),
        "targetKind": "prop",
        "sceneScope": scene_scope,
        "propKey": resolved_prop_key,
        "assetNode": asset_node,
        "baseInstanceId": base_object.get("instanceId"),
        "instanceIds": [node["instanceId"] for node in created_nodes],
        "duplicateNodes": created_nodes,
        "rowStep": row_step,
    }


def _rendered_height(asset: dict | None) -> float | None:
    if not isinstance(asset, dict):
        return None
    scale = asset.get("scale")
    frame_height = asset.get("frameHeight")
    if not isinstance(scale, (int, float)) or not isinstance(frame_height, (int, float)):
        return None
    if frame_height <= 0:
        return None
    return float(scale) * float(frame_height)


def _pick_reference_height(states: dict, preferred_state: str) -> float | None:
    heights = []
    for asset in states.values():
        height = _rendered_height(asset)
        if height is not None:
            heights.append(height)
    if not heights:
        return None
    max_height = max(heights)
    preferred = _rendered_height(states.get(preferred_state))
    if preferred is not None and preferred >= max_height * 0.7:
        return preferred
    return max_height


def pick_scale(
    theme: dict,
    *,
    metadata: dict,
    target_kind: str,
    hero_id: str,
    state_key: str,
    override_scale: float | None,
) -> float:
    if override_scale is not None:
        return float(override_scale)
    new_frame_height = float(metadata["frameHeight"])
    if new_frame_height <= 0:
        return 1.0
    if target_kind == "main":
        states = (((theme.get("mainHero") or {}).get("states")) or {})
        reference_height = _pick_reference_height(states, state_key)
        if reference_height is not None:
            return reference_height / new_frame_height
        hero_scale = ((theme.get("mainHero") or {}).get("scale"))
        if isinstance(hero_scale, (int, float)):
            return float(hero_scale)
        return 1.0
    states = ((((theme.get("supportHeroes") or {}).get(hero_id)) or {}).get("states")) or {}
    reference_height = _pick_reference_height(states, state_key)
    if reference_height is not None:
        return reference_height / new_frame_height
    hero_scale = (((theme.get("supportHeroes") or {}).get(hero_id) or {}).get("scale"))
    if isinstance(hero_scale, (int, float)):
        return float(hero_scale)
    return 1.0


def sync_theme_json(
    *,
    theme_json_path: Path,
    metadata: dict,
    target_kind: str,
    state_key: str,
    hero_id: str | None,
    override_scale: float | None,
) -> dict:
    theme = load_theme(theme_json_path)
    png_path = relative_static_path(Path(metadata["output"]), theme_json_path)
    scale = pick_scale(
        theme,
        metadata=metadata,
        target_kind=target_kind,
        hero_id=hero_id or "",
        state_key=state_key,
        override_scale=override_scale,
    )
    state_node = {
        "png": png_path,
        "frameWidth": int(metadata["frameWidth"]),
        "frameHeight": int(metadata["frameHeight"]),
        "frames": int(metadata["frames"]),
        "frameRate": int(metadata["frameRate"]),
        "scale": round(float(scale), 3),
    }

    if target_kind == "main":
        main_hero = theme.setdefault("mainHero", {})
        states = main_hero.setdefault("states", {})
        states[state_key] = state_node
        # Keep legacy fields in sync for base states when they exist.
        if state_key in {"idle", "writing", "researching", "executing", "syncing", "error"}:
            assets = theme.setdefault("assets", {})
            hero_states = assets.setdefault("heroStates", {})
            hero_states[state_key] = dict(state_node)
        if state_key == "walking":
            main_hero["walking"] = state_node
            assets = theme.setdefault("assets", {})
            hero_asset = assets.setdefault("hero", {})
            hero_asset.update({
                "png": png_path,
                "frameWidth": int(metadata["frameWidth"]),
                "frameHeight": int(metadata["frameHeight"]),
                "frames": int(metadata["frames"]),
                "frameRate": int(metadata["frameRate"]),
            })
    else:
        support_heroes = theme.setdefault("supportHeroes", {})
        if hero_id not in support_heroes:
            raise ValueError(f"support hero not found in theme.json: {hero_id}")
        hero_node = support_heroes[hero_id]
        states = hero_node.setdefault("states", {})
        states[state_key] = state_node

    save_theme(theme_json_path, theme)
    return {
        "themeJson": str(theme_json_path.resolve()),
        "targetKind": target_kind,
        "heroId": hero_id,
        "stateKey": state_key,
        "stateNode": state_node,
    }


def inspect_input(
    input_path: Path,
    pattern: str = "*.png",
    frame_count: int | None = None,
    frame_rate: int | None = None,
    *,
    frame_width: int | None = None,
    frame_height: int | None = None,
    theme_json_path: Path | None = None,
    target_kind: str | None = None,
    hero_id: str | None = None,
    state_key: str | None = None,
) -> dict:
    if input_path.is_dir():
        frame_paths = list_png_frames(input_path, pattern)
        with Image.open(frame_paths[0]) as first:
            width, height = first.size
        return {
            "sourceType": "png_frames",
            "sourcePath": input_path,
            "framePaths": frame_paths,
            "frames": len(frame_paths),
            "frameWidth": width,
            "frameHeight": height,
            "suggestedFrameRate": int(frame_rate or DEFAULT_FRAME_RATE),
        }

    suffix = input_path.suffix.lower()
    if suffix == ".gif":
        frames, gif_frame_rate = load_gif_frames(input_path)
        normalized, width, height = normalize_frames(frames)
        return {
            "sourceType": "gif",
            "sourcePath": input_path,
            "frames": len(normalized),
            "frameWidth": width,
            "frameHeight": height,
            "suggestedFrameRate": int(frame_rate or gif_frame_rate),
            "framePaths": [],
        }

    if suffix == ".png":
        metadata = inspect_existing_spritesheet(
            input_path,
            frame_count or guess_frame_count_from_sheet(input_path),
            int(frame_rate or DEFAULT_FRAME_RATE),
            frame_width=frame_width,
            frame_height=frame_height,
            theme_json_path=theme_json_path,
            target_kind=target_kind,
            hero_id=hero_id,
            state_key=state_key,
        )
        return {
            "sourceType": "spritesheet_png",
            "sourcePath": input_path,
            "frames": metadata["frames"],
            "frameWidth": metadata["frameWidth"],
            "frameHeight": metadata["frameHeight"],
            "suggestedFrameRate": metadata["frameRate"],
            "framePaths": [],
        }

    raise ValueError(f"unsupported input: {input_path}")


def emit_texture_warning(metadata: dict) -> List[str]:
    warnings: List[str] = []
    if int(metadata["frameWidth"]) > 1024 or int(metadata["frameHeight"]) > 1024:
        warnings.append("Single-frame size is large. Prefer <= 1024px on the long edge.")
    if int(metadata["sheetWidth"]) > MAX_TEXTURE_SIZE or int(metadata["sheetHeight"]) > MAX_TEXTURE_SIZE:
        warnings.append(f"Spritesheet size exceeds {MAX_TEXTURE_SIZE}px. This may render as black blocks in browsers.")
    return warnings


def run_cli(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    if input_path.suffix.lower() == ".png":
        metadata = inspect_existing_spritesheet(
            input_path,
            args.frame_count or guess_frame_count_from_sheet(input_path),
            int(args.frame_rate or DEFAULT_FRAME_RATE),
            frame_width=args.frame_width,
            frame_height=args.frame_height,
            theme_json_path=Path(args.theme_json) if args.theme_json else None,
            target_kind=args.target_kind if args.sync else None,
            hero_id=args.hero_id if args.sync else None,
            state_key=args.state_key if args.sync else None,
        )
        if emit_texture_warning(metadata):
            metadata = repack_existing_spritesheet(
                input_path=input_path,
                metadata=metadata,
                write_meta=not args.no_meta,
            )
        else:
            write_existing_spritesheet_metadata(metadata, input_path, write_meta=not args.no_meta)
    else:
        output_path = Path(args.output) if args.output else default_output_for_input(input_path)
        metadata = build_spritesheet(
            input_path=input_path,
            output_path=output_path,
            pattern=args.pattern,
            frame_rate=args.frame_rate,
            write_meta=not args.no_meta,
        )

    sync_result = None
    if args.sync:
        if args.target_kind == "prop":
            theme_json_path = Path(args.theme_json or DEFAULT_THEME_JSON)
            sync_result = sync_prop_object(
                theme_json_path=theme_json_path,
                metadata=metadata,
                prop_key=args.prop_key,
                duplicate_count=int(args.duplicate_count),
                instance_label=args.instance_label,
                scene_scope=args.scene_scope,
            )
        else:
            if not args.state_key:
                raise ValueError("--state-key is required when using --sync")
            if args.target_kind == "support" and not args.hero_id:
                raise ValueError("--hero-id is required when target-kind is support")
            theme_json_path = Path(args.theme_json or DEFAULT_THEME_JSON)
            sync_result = sync_theme_json(
                theme_json_path=theme_json_path,
                metadata=metadata,
                target_kind=args.target_kind,
                state_key=args.state_key,
                hero_id=args.hero_id,
                override_scale=args.scale,
            )

    result = {
        "metadata": metadata,
        "warnings": emit_texture_warning(metadata),
        "sync": sync_result,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def launch_gui() -> int:
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk
    except Exception as exc:  # pragma: no cover
        print(f"Tkinter unavailable: {exc}", file=sys.stderr)
        return 1

    root = tk.Tk()
    root.title("Spritesheet Sync Tool")
    root.geometry("1080x860")
    root.minsize(980, 760)

    source_mode = tk.StringVar(value="folder")
    source_path_var = tk.StringVar(value="")
    pattern_var = tk.StringVar(value="*.png")
    output_path_var = tk.StringVar(value="")
    frame_rate_var = tk.StringVar(value=str(DEFAULT_FRAME_RATE))
    frame_count_var = tk.StringVar(value="")
    frame_width_var = tk.StringVar(value="")
    frame_height_var = tk.StringVar(value="")
    write_meta_var = tk.BooleanVar(value=True)

    sync_enabled_var = tk.BooleanVar(value=True)
    theme_json_var = tk.StringVar(value=str(DEFAULT_THEME_JSON))
    target_kind_var = tk.StringVar(value="support")
    hero_id_var = tk.StringVar(value="")
    state_key_var = tk.StringVar(value="")
    scale_var = tk.StringVar(value="")
    prop_key_var = tk.StringVar(value="")
    duplicate_count_var = tk.StringVar(value="1")
    instance_label_var = tk.StringVar(value="")
    scene_scope_var = tk.StringVar(value="main")

    status_var = tk.StringVar(value="Select a source, then build and optionally sync theme.json.")

    def log(message: str) -> None:
        status_var.set(message)
        log_box.configure(state="normal")
        log_box.insert("end", message + "\n")
        log_box.see("end")
        log_box.configure(state="disabled")

    def sync_target_is_prop() -> bool:
        return target_kind_var.get() == "prop"

    def update_sync_target_ui() -> None:
        is_prop = sync_target_is_prop()
        hero_id_entry.configure(state="disabled" if is_prop else "normal")
        state_key_entry.configure(state="disabled" if is_prop else "normal")
        scale_entry.configure(state="disabled" if is_prop else "normal")
        prop_key_entry.configure(state="normal" if is_prop else "disabled")
        duplicate_count_entry.configure(state="normal" if is_prop else "disabled")
        instance_label_entry.configure(state="normal" if is_prop else "disabled")
        scene_scope_combo.configure(state="readonly" if is_prop else "disabled")

    def autofill_prop_sync_fields(info: dict | None = None) -> None:
        if not sync_enabled_var.get() or not sync_target_is_prop():
            return
        source_text = source_path_var.get().strip()
        theme_text = theme_json_var.get().strip()
        if not source_text or not theme_text:
            return
        try:
            theme = load_theme(Path(theme_text))
            metadata_stub = {
                "output": str(Path(source_text).resolve()),
            }
            inferred_key = infer_prop_key(theme, Path(theme_text), metadata_stub)
            prop_key_var.set(inferred_key or suggest_prop_key(metadata_stub))
            if not instance_label_var.get().strip():
                instance_label_var.set(strip_spritesheet_suffix(Path(source_text).stem))
        except Exception:
            pass

    def set_mode(mode: str) -> None:
        source_mode.set(mode)
        source_path_var.set("")
        output_path_var.set("")
        frame_count_var.set("")
        frame_width_var.set("")
        frame_height_var.set("")
        preview.delete(0, "end")
        preview_info.configure(text="No source loaded.")
        if mode == "folder":
            source_label.configure(text="PNG frame folder")
            pattern_entry.configure(state="normal")
            output_entry.configure(state="normal")
            output_button.configure(state="normal")
            frame_count_entry.configure(state="disabled")
        elif mode == "gif":
            source_label.configure(text="GIF file")
            pattern_entry.configure(state="disabled")
            output_entry.configure(state="normal")
            output_button.configure(state="normal")
            frame_count_entry.configure(state="disabled")
        else:
            source_label.configure(text="Spritesheet PNG")
            pattern_entry.configure(state="disabled")
            output_entry.configure(state="disabled")
            output_button.configure(state="disabled")
            frame_count_entry.configure(state="normal")

    def choose_source() -> None:
        mode = source_mode.get()
        if mode == "folder":
            path = filedialog.askdirectory(title="Select PNG frame folder")
        elif mode == "gif":
            path = filedialog.askopenfilename(title="Select GIF", filetypes=[("GIF", "*.gif"), ("All files", "*.*")])
        else:
            path = filedialog.askopenfilename(title="Select spritesheet PNG", filetypes=[("PNG", "*.png"), ("All files", "*.*")])
        if not path:
            return
        source_path_var.set(path)
        if mode != "spritesheet" and not output_path_var.get().strip():
            output_path_var.set(str(default_output_for_input(Path(path))))
        inspect_current_source()

    def choose_output() -> None:
        path = filedialog.asksaveasfilename(title="Select output PNG", defaultextension=".png", filetypes=[("PNG", "*.png")])
        if path:
            output_path_var.set(path)

    def choose_theme_json() -> None:
        path = filedialog.askopenfilename(title="Select theme.json", filetypes=[("JSON", "*.json"), ("All files", "*.*")])
        if path:
            theme_json_var.set(path)

    def inspect_current_source() -> None:
        preview.delete(0, "end")
        source_text = source_path_var.get().strip()
        if not source_text:
            return
        try:
            info = inspect_input(
                Path(source_text),
                pattern=pattern_var.get().strip() or "*.png",
                frame_count=int(frame_count_var.get().strip()) if frame_count_var.get().strip() else None,
                frame_rate=int(frame_rate_var.get().strip() or DEFAULT_FRAME_RATE),
                frame_width=int(frame_width_var.get().strip()) if frame_width_var.get().strip() else None,
                frame_height=int(frame_height_var.get().strip()) if frame_height_var.get().strip() else None,
                theme_json_path=Path(theme_json_var.get().strip()) if sync_enabled_var.get() and theme_json_var.get().strip() else None,
                target_kind=target_kind_var.get() if sync_enabled_var.get() else None,
                hero_id=hero_id_var.get().strip() or None,
                state_key=state_key_var.get().strip() or None,
            )
        except Exception as exc:
            messagebox.showerror("Inspect failed", str(exc))
            log(f"Inspect failed: {exc}")
            return

        frame_paths = info.get("framePaths") or []
        if frame_paths:
            for frame_path in frame_paths[:40]:
                preview.insert("end", frame_path.name)
            if len(frame_paths) > 40:
                preview.insert("end", f"... ({len(frame_paths) - 40} more)")
        else:
            preview.insert("end", Path(source_text).name)

        preview_info.configure(
            text=f"{info['sourceType']} | frames: {info['frames']} | frame: {info['frameWidth']}x{info['frameHeight']}"
        )
        frame_rate_var.set(str(info["suggestedFrameRate"]))
        if source_mode.get() == "spritesheet":
            frame_count_var.set(str(info["frames"]))
            frame_width_var.set(str(info["frameWidth"]))
            frame_height_var.set(str(info["frameHeight"]))
        autofill_prop_sync_fields(info)
        log(f"Loaded source: {source_text}")

    def build_or_sync_now() -> None:
        source_text = source_path_var.get().strip()
        if not source_text:
            messagebox.showerror("Missing source", "Please choose a source first.")
            return
        source_path = Path(source_text)

        try:
            if source_mode.get() == "spritesheet":
                metadata = inspect_existing_spritesheet(
                    source_path,
                    int(frame_count_var.get().strip()) if frame_count_var.get().strip() else guess_frame_count_from_sheet(source_path),
                    int(frame_rate_var.get().strip() or DEFAULT_FRAME_RATE),
                    frame_width=int(frame_width_var.get().strip()) if frame_width_var.get().strip() else None,
                    frame_height=int(frame_height_var.get().strip()) if frame_height_var.get().strip() else None,
                    theme_json_path=Path(theme_json_var.get().strip()) if sync_enabled_var.get() and theme_json_var.get().strip() else None,
                    target_kind=target_kind_var.get() if sync_enabled_var.get() else None,
                    hero_id=hero_id_var.get().strip() or None,
                    state_key=state_key_var.get().strip() or None,
                )
                if emit_texture_warning(metadata):
                    metadata = repack_existing_spritesheet(
                        input_path=source_path,
                        metadata=metadata,
                        write_meta=write_meta_var.get(),
                    )
                else:
                    write_existing_spritesheet_metadata(metadata, source_path, write_meta=write_meta_var.get())
                frame_count_var.set(str(metadata["frames"]))
            else:
                output_text = output_path_var.get().strip()
                if not output_text:
                    raise ValueError("Please choose an output PNG path.")
                metadata = build_spritesheet(
                    input_path=source_path,
                    output_path=Path(output_text),
                    pattern=pattern_var.get().strip() or "*.png",
                    frame_rate=int(frame_rate_var.get().strip() or DEFAULT_FRAME_RATE),
                    write_meta=write_meta_var.get(),
                )
        except Exception as exc:
            messagebox.showerror("Build failed", str(exc))
            log(f"Build failed: {exc}")
            return

        sync_result = None
        if sync_enabled_var.get():
            try:
                if sync_target_is_prop():
                    sync_result = sync_prop_object(
                        theme_json_path=Path(theme_json_var.get().strip() or DEFAULT_THEME_JSON),
                        metadata=metadata,
                        prop_key=prop_key_var.get().strip() or None,
                        duplicate_count=int(duplicate_count_var.get().strip() or "1"),
                        instance_label=instance_label_var.get().strip() or None,
                        scene_scope=scene_scope_var.get().strip() or "main",
                    )
                else:
                    sync_result = sync_theme_json(
                        theme_json_path=Path(theme_json_var.get().strip() or DEFAULT_THEME_JSON),
                        metadata=metadata,
                        target_kind=target_kind_var.get(),
                        state_key=state_key_var.get().strip(),
                        hero_id=hero_id_var.get().strip() or None,
                        override_scale=float(scale_var.get().strip()) if scale_var.get().strip() else None,
                    )
            except Exception as exc:
                messagebox.showerror("Theme sync failed", str(exc))
                log(f"Theme sync failed: {exc}")
                return

        warnings = emit_texture_warning(metadata)
        log(f"Spritesheet ready: {metadata['output']}")
        log(f"frames={metadata['frames']} frame={metadata['frameWidth']}x{metadata['frameHeight']} frameRate={metadata['frameRate']}")
        for warning in warnings:
            log(f"WARNING: {warning}")
        if sync_result:
            if sync_result.get("targetKind") == "prop":
                log(f"Theme synced: prop / {sync_result['sceneScope']} / {sync_result['propKey']} / {', '.join(sync_result['instanceIds'])}")
            else:
                log(f"Theme synced: {sync_result['targetKind']} / {sync_result['heroId'] or 'main'} / {sync_result['stateKey']}")

        summary_lines = [
            f"Output: {metadata['output']}",
            f"Frames: {metadata['frames']}",
            f"Frame size: {metadata['frameWidth']}x{metadata['frameHeight']}",
            f"Frame rate: {metadata['frameRate']}",
        ]
        if sync_result:
            if sync_result.get("targetKind") == "prop":
                summary_lines.append(f"Scene scope: {sync_result['sceneScope']}")
                summary_lines.append(f"Base object: {sync_result['baseInstanceId']}")
                summary_lines.append(f"Prop duplicates added: {', '.join(sync_result['instanceIds'])}")
            else:
                summary_lines.append(f"Theme synced: {sync_result['stateKey']}")
        if warnings:
            summary_lines.append("")
            summary_lines.extend([f"Warning: {warning}" for warning in warnings])
        messagebox.showinfo("Done", "\n".join(summary_lines))

    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)

    frame = ttk.Frame(root, padding=12)
    frame.grid(sticky="nsew")
    frame.columnconfigure(1, weight=1)
    frame.rowconfigure(6, weight=1)
    frame.rowconfigure(9, weight=1)

    ttk.Label(frame, text="Source type").grid(row=0, column=0, sticky="w")
    mode_row = ttk.Frame(frame)
    mode_row.grid(row=0, column=1, sticky="w")
    ttk.Radiobutton(mode_row, text="PNG folder", value="folder", variable=source_mode, command=lambda: set_mode("folder")).pack(side="left")
    ttk.Radiobutton(mode_row, text="GIF", value="gif", variable=source_mode, command=lambda: set_mode("gif")).pack(side="left", padx=(10, 0))
    ttk.Radiobutton(mode_row, text="Existing spritesheet PNG", value="spritesheet", variable=source_mode, command=lambda: set_mode("spritesheet")).pack(side="left", padx=(10, 0))

    source_label = ttk.Label(frame, text="PNG frame folder")
    source_label.grid(row=1, column=0, sticky="w", pady=(8, 0))
    source_row = ttk.Frame(frame)
    source_row.grid(row=1, column=1, sticky="ew", pady=(8, 0))
    source_row.columnconfigure(0, weight=1)
    ttk.Entry(source_row, textvariable=source_path_var).grid(row=0, column=0, sticky="ew")
    ttk.Button(source_row, text="Browse", command=choose_source).grid(row=0, column=1, padx=(8, 0))
    ttk.Button(source_row, text="Inspect", command=inspect_current_source).grid(row=0, column=2, padx=(8, 0))

    ttk.Label(frame, text="PNG pattern").grid(row=2, column=0, sticky="w", pady=(8, 0))
    pattern_entry = ttk.Entry(frame, textvariable=pattern_var)
    pattern_entry.grid(row=2, column=1, sticky="ew", pady=(8, 0))

    ttk.Label(frame, text="Frame rate").grid(row=3, column=0, sticky="w", pady=(8, 0))
    frame_rate_entry = ttk.Entry(frame, textvariable=frame_rate_var)
    frame_rate_entry.grid(row=3, column=1, sticky="w", pady=(8, 0))

    ttk.Label(frame, text="Frame count (spritesheet mode)").grid(row=4, column=0, sticky="w", pady=(8, 0))
    frame_count_entry = ttk.Entry(frame, textvariable=frame_count_var)
    frame_count_entry.grid(row=4, column=1, sticky="w", pady=(8, 0))

    frame_size_row = ttk.Frame(frame)
    frame_size_row.grid(row=4, column=1, sticky="e", pady=(8, 0))
    ttk.Label(frame_size_row, text="Frame size").pack(side="left")
    ttk.Entry(frame_size_row, textvariable=frame_width_var, width=6).pack(side="left", padx=(8, 4))
    ttk.Label(frame_size_row, text="x").pack(side="left")
    ttk.Entry(frame_size_row, textvariable=frame_height_var, width=6).pack(side="left", padx=(4, 0))

    ttk.Label(frame, text="Output PNG").grid(row=5, column=0, sticky="w", pady=(8, 0))
    output_row = ttk.Frame(frame)
    output_row.grid(row=5, column=1, sticky="ew", pady=(8, 0))
    output_row.columnconfigure(0, weight=1)
    output_entry = ttk.Entry(output_row, textvariable=output_path_var)
    output_entry.grid(row=0, column=0, sticky="ew")
    output_button = ttk.Button(output_row, text="Save as", command=choose_output)
    output_button.grid(row=0, column=1, padx=(8, 0))
    ttk.Checkbutton(output_row, text="Write .meta.json", variable=write_meta_var).grid(row=0, column=2, padx=(8, 0))

    sync_box = ttk.LabelFrame(frame, text="Theme sync", padding=10)
    sync_box.grid(row=6, column=0, columnspan=2, sticky="nsew", pady=(14, 0))
    sync_box.columnconfigure(1, weight=1)

    ttk.Checkbutton(sync_box, text="Update theme.json after build/sync", variable=sync_enabled_var).grid(row=0, column=0, columnspan=2, sticky="w")
    ttk.Label(sync_box, text="theme.json").grid(row=1, column=0, sticky="w", pady=(8, 0))
    theme_row = ttk.Frame(sync_box)
    theme_row.grid(row=1, column=1, sticky="ew", pady=(8, 0))
    theme_row.columnconfigure(0, weight=1)
    ttk.Entry(theme_row, textvariable=theme_json_var).grid(row=0, column=0, sticky="ew")
    ttk.Button(theme_row, text="Browse", command=choose_theme_json).grid(row=0, column=1, padx=(8, 0))

    ttk.Label(sync_box, text="Target").grid(row=2, column=0, sticky="w", pady=(8, 0))
    target_row = ttk.Frame(sync_box)
    target_row.grid(row=2, column=1, sticky="w", pady=(8, 0))
    ttk.Radiobutton(target_row, text="Main hero", value="main", variable=target_kind_var, command=update_sync_target_ui).pack(side="left")
    ttk.Radiobutton(target_row, text="Support hero", value="support", variable=target_kind_var, command=update_sync_target_ui).pack(side="left", padx=(10, 0))
    ttk.Radiobutton(target_row, text="Prop object", value="prop", variable=target_kind_var, command=update_sync_target_ui).pack(side="left", padx=(10, 0))

    ttk.Label(sync_box, text="Hero ID").grid(row=3, column=0, sticky="w", pady=(8, 0))
    hero_id_entry = ttk.Entry(sync_box, textvariable=hero_id_var)
    hero_id_entry.grid(row=3, column=1, sticky="ew", pady=(8, 0))

    ttk.Label(sync_box, text="State key").grid(row=4, column=0, sticky="w", pady=(8, 0))
    state_key_entry = ttk.Entry(sync_box, textvariable=state_key_var)
    state_key_entry.grid(row=4, column=1, sticky="ew", pady=(8, 0))

    ttk.Label(sync_box, text="Scale override (optional)").grid(row=5, column=0, sticky="w", pady=(8, 0))
    scale_entry = ttk.Entry(sync_box, textvariable=scale_var)
    scale_entry.grid(row=5, column=1, sticky="ew", pady=(8, 0))

    ttk.Label(sync_box, text="Prop key").grid(row=6, column=0, sticky="w", pady=(8, 0))
    prop_key_entry = ttk.Entry(sync_box, textvariable=prop_key_var)
    prop_key_entry.grid(row=6, column=1, sticky="ew", pady=(8, 0))

    ttk.Label(sync_box, text="Duplicate count").grid(row=7, column=0, sticky="w", pady=(8, 0))
    duplicate_count_entry = ttk.Entry(sync_box, textvariable=duplicate_count_var)
    duplicate_count_entry.grid(row=7, column=1, sticky="ew", pady=(8, 0))

    ttk.Label(sync_box, text="Instance label").grid(row=8, column=0, sticky="w", pady=(8, 0))
    instance_label_entry = ttk.Entry(sync_box, textvariable=instance_label_var)
    instance_label_entry.grid(row=8, column=1, sticky="ew", pady=(8, 0))

    ttk.Label(sync_box, text="Scene scope").grid(row=9, column=0, sticky="w", pady=(8, 0))
    scene_scope_combo = ttk.Combobox(
        sync_box,
        textvariable=scene_scope_var,
        state="readonly",
        values=[value for value, _ in PROP_SCENE_SCOPES],
    )
    scene_scope_combo.grid(row=9, column=1, sticky="ew", pady=(8, 0))

    ttk.Button(frame, text="Build / Sync", command=build_or_sync_now).grid(row=7, column=1, sticky="e", pady=(14, 0))

    ttk.Label(frame, text="Preview").grid(row=8, column=0, sticky="nw", pady=(14, 0))
    preview_frame = ttk.Frame(frame)
    preview_frame.grid(row=8, column=1, sticky="nsew", pady=(14, 0))
    preview_frame.columnconfigure(0, weight=1)
    preview_frame.rowconfigure(0, weight=1)
    preview = tk.Listbox(preview_frame, height=12)
    preview.grid(row=0, column=0, sticky="nsew")
    preview_scroll = ttk.Scrollbar(preview_frame, orient="vertical", command=preview.yview)
    preview_scroll.grid(row=0, column=1, sticky="ns")
    preview.configure(yscrollcommand=preview_scroll.set)
    preview_info = ttk.Label(preview_frame, text="No source loaded.")
    preview_info.grid(row=1, column=0, columnspan=2, sticky="w", pady=(6, 0))

    ttk.Label(frame, text="Log").grid(row=9, column=0, sticky="nw", pady=(14, 0))
    log_box = tk.Text(frame, height=10, wrap="word", state="disabled")
    log_box.grid(row=9, column=1, sticky="nsew", pady=(14, 0))

    status_bar = ttk.Label(root, textvariable=status_var, relief="sunken", anchor="w", padding=(8, 4))
    status_bar.grid(row=1, column=0, sticky="ew")

    set_mode("folder")
    update_sync_target_ui()
    root.mainloop()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build spritesheets and sync theme.json.")
    parser.add_argument("--gui", action="store_true", help="Open the GUI.")
    parser.add_argument("--input", help="Input GIF, PNG frame folder, or existing spritesheet PNG.")
    parser.add_argument("--output", help="Output PNG path. Defaults to <input>-spritesheet.png for build modes.")
    parser.add_argument("--pattern", default="*.png", help="Glob pattern for PNG frames when input is a folder.")
    parser.add_argument("--frame-rate", type=int, help="Frame rate for metadata and theme sync.")
    parser.add_argument("--frame-count", type=int, help="Required when input is an existing spritesheet PNG.")
    parser.add_argument("--frame-width", type=int, help="Optional frame width hint for an existing spritesheet PNG.")
    parser.add_argument("--frame-height", type=int, help="Optional frame height hint for an existing spritesheet PNG.")
    parser.add_argument("--no-meta", action="store_true", help="Do not write <output>.meta.json in build modes.")
    parser.add_argument("--sync", action="store_true", help="Update theme.json after build or inspect.")
    parser.add_argument("--theme-json", help="Path to theme.json. Defaults to frontend/themes/liangshan/theme.json.")
    parser.add_argument("--target-kind", choices=["main", "support", "prop"], default="support", help="Where to write the sync result.")
    parser.add_argument("--hero-id", help="Support hero id, e.g. wuyong or wusong.")
    parser.add_argument("--state-key", help="State key to update, e.g. writing / executing / error / idle_b.")
    parser.add_argument("--scale", type=float, help="Optional scale override. Defaults to keeping existing scale.")
    parser.add_argument("--prop-key", help="Prop key to match in theme.assets.spritesheets when target-kind is prop.")
    parser.add_argument("--duplicate-count", type=int, default=1, help="How many duplicate prop instances to append in a row.")
    parser.add_argument("--instance-label", help="Readable prop instance prefix, e.g. 'Fire pit'.")
    parser.add_argument(
        "--scene-scope",
        choices=[value for value, _ in PROP_SCENE_SCOPES],
        default="main",
        help="Which scene container to write prop objects into when target-kind is prop.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.gui or not args.input:
        return launch_gui()
    return run_cli(args)


if __name__ == "__main__":
    sys.exit(main())
