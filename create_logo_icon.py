#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "logo.png"
TARGET = ROOT / "logo.ico"


def main() -> int:
    if not SOURCE.exists():
        raise FileNotFoundError(f"logo source not found: {SOURCE}")

    image = Image.open(SOURCE).convert("RGBA")
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    image.save(TARGET, format="ICO", sizes=sizes)
    print(TARGET)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
