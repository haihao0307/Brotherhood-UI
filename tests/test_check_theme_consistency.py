import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

import check_theme_consistency as checker


class FrontOverlayValidationTests(unittest.TestCase):
    def create_png(self, path: Path, size: tuple[int, int]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", size, (0, 0, 0, 0)).save(path)

    def create_mp3(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"ID3")

    def make_theme(self, root: Path) -> Path:
        theme_root = root / "frontend" / "themes" / "liangshan"
        theme_root.mkdir(parents=True, exist_ok=True)

        self.create_png(theme_root / "bg.png", (1280, 720))
        self.create_png(theme_root / "songjiang_idle-spritesheet.png", (1, 1))

        for name in [
            "wuyong_walking-spritesheet.png",
            "sunerniang_walking-spritesheet.png",
            "wusong_walking-spritesheet.png",
            "linchong_walking-spritesheet.png",
            "luzhishen_walking-spritesheet.png",
        ]:
            self.create_png(theme_root / name, (1, 1))

        front_dir = theme_root / "props" / "main" / "front"
        self.create_png(front_dir / "Front_001.png", (1280, 720))
        self.create_png(front_dir / "Front_002.png", (1280, 720))

        self.create_mp3(theme_root / "audio" / "songjiang_idle.mp3")

        payload = {
            "assets": {
                "bg": {
                    "png": "/static/themes/liangshan/bg.png",
                },
                "spritesheets": {},
            },
            "mainHero": {
                "id": "songjiang",
                "role": "songjiang",
                "states": {
                    "idle_a": {
                        "png": "/static/themes/liangshan/songjiang_idle-spritesheet.png",
                        "frameWidth": 1,
                        "frameHeight": 1,
                        "frames": 1,
                        "frameRate": 1,
                    }
                },
            },
            "supportHeroes": {},
            "mainScene": {
                "background": {
                    "png": "/static/themes/liangshan/bg.png",
                },
                "cast": {
                    "songjiang": {
                        "x": 640,
                        "y": 600,
                        "animationState": "idle_a",
                    }
                },
                "propsRoot": "props/main",
                "randomEvents": {
                    "enabled": False,
                    "heroStyles": {
                        "songjiang": "steady",
                    },
                },
                "supportRoaming": {},
                "frontOverlay": {
                    "enabled": True,
                    "framesPath": "props/main/front",
                    "filePattern": "Front_{index}.png",
                    "startIndex": 1,
                    "zeroPad": 3,
                    "frameCount": 2,
                    "fps": 10,
                },
            },
            "subscenes": {},
            "handoffDialogues": {},
            "heroDialogues": {
                "songjiang": {
                    "idle": {
                        "lines": [f"Line {index}" for index in range(20)],
                    }
                }
            },
            "audio": {
                "roles": {
                    "songjiang": {
                        "states": {
                            "idle": {
                                "mp3": "/static/themes/liangshan/audio/songjiang_idle.mp3",
                            }
                        }
                    }
                }
            },
            "objects": [],
        }

        theme_path = theme_root / "theme.json"
        theme_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return theme_path

    def update_front_overlay(self, theme_path: Path, overlay: dict) -> None:
        payload = json.loads(theme_path.read_text(encoding="utf-8"))
        payload["mainScene"]["frontOverlay"] = overlay
        theme_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def analyze_with_temp_theme(self, theme_path: Path) -> tuple[list[str], list[str], dict]:
        original_repo_root = checker.REPO_ROOT
        original_theme_root = checker.THEME_ROOT
        original_theme_json = checker.THEME_JSON
        try:
            checker.REPO_ROOT = theme_path.parents[3]
            checker.THEME_ROOT = theme_path.parent
            checker.THEME_JSON = theme_path
            return checker.analyze_theme(theme_path)
        finally:
            checker.REPO_ROOT = original_repo_root
            checker.THEME_ROOT = original_theme_root
            checker.THEME_JSON = original_theme_json

    def test_accepts_valid_front_overlay_sequence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            theme_path = self.make_theme(Path(temp_dir))

            errors, warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_accepts_sparse_front_overlay_sequence_with_runtime_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            theme_path = self.make_theme(Path(temp_dir))
            self.update_front_overlay(
                theme_path,
                {
                    "enabled": True,
                    "framesPath": "props/main/front",
                    "frameCount": 2,
                    "fps": 10,
                },
            )

            errors, warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_rejects_missing_front_overlay_frame(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            theme_path = self.make_theme(temp_root)
            missing_frame = temp_root / "frontend" / "themes" / "liangshan" / "props" / "main" / "front" / "Front_002.png"
            missing_frame.unlink()

            errors, _warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertTrue(any("frontOverlay" in line and "Front_002.png" in line for line in errors))

    def test_rejects_explicit_invalid_front_overlay_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            theme_path = self.make_theme(Path(temp_dir))
            self.update_front_overlay(
                theme_path,
                {
                    "enabled": True,
                    "framesPath": "props/main/front",
                    "filePattern": "Front_{index}.png",
                    "startIndex": 0,
                    "zeroPad": 0,
                    "frameCount": 2,
                    "fps": 10,
                },
            )

            errors, _warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertTrue(any("mainScene.frontOverlay: invalid frontOverlay config" == line for line in errors))

    def test_rejects_fractional_front_overlay_numeric_fields(self) -> None:
        for field_name, value in [
            ("startIndex", 1.5),
            ("zeroPad", 3.5),
            ("frameCount", 2.5),
            ("fps", 10.5),
        ]:
            with self.subTest(field_name=field_name):
                with tempfile.TemporaryDirectory() as temp_dir:
                    theme_path = self.make_theme(Path(temp_dir))
                    overlay = {
                        "enabled": True,
                        "framesPath": "props/main/front",
                        "filePattern": "Front_{index}.png",
                        "startIndex": 1,
                        "zeroPad": 3,
                        "frameCount": 2,
                        "fps": 10,
                    }
                    overlay[field_name] = value
                    self.update_front_overlay(theme_path, overlay)

                    errors, _warnings, _summary = self.analyze_with_temp_theme(theme_path)

                self.assertTrue(any("mainScene.frontOverlay: invalid frontOverlay config" == line for line in errors))

    def test_accepts_trimmed_front_overlay_file_pattern(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            theme_path = self.make_theme(Path(temp_dir))
            self.update_front_overlay(
                theme_path,
                {
                    "enabled": True,
                    "framesPath": "props/main/front",
                    "filePattern": "  Front_{index}.png  ",
                    "startIndex": 1,
                    "zeroPad": 3,
                    "frameCount": 2,
                    "fps": 10,
                },
            )

            errors, warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_rejects_boolean_front_overlay_numeric_fields(self) -> None:
        for field_name, value in [
            ("startIndex", True),
            ("zeroPad", False),
            ("frameCount", True),
            ("fps", False),
        ]:
            with self.subTest(field_name=field_name):
                with tempfile.TemporaryDirectory() as temp_dir:
                    theme_path = self.make_theme(Path(temp_dir))
                    overlay = {
                        "enabled": True,
                        "framesPath": "props/main/front",
                        "filePattern": "Front_{index}.png",
                        "startIndex": 1,
                        "zeroPad": 3,
                        "frameCount": 2,
                        "fps": 10,
                    }
                    overlay[field_name] = value
                    self.update_front_overlay(theme_path, overlay)

                    errors, _warnings, _summary = self.analyze_with_temp_theme(theme_path)

                self.assertTrue(any("mainScene.frontOverlay: invalid frontOverlay config" == line for line in errors))

    def test_rejects_explicit_non_string_front_overlay_file_pattern(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            theme_path = self.make_theme(Path(temp_dir))
            self.update_front_overlay(
                theme_path,
                {
                    "enabled": True,
                    "framesPath": "props/main/front",
                    "filePattern": True,
                    "startIndex": 1,
                    "zeroPad": 3,
                    "frameCount": 2,
                    "fps": 10,
                },
            )

            errors, _warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertTrue(any("mainScene.frontOverlay: invalid frontOverlay config" == line for line in errors))

    def test_rejects_explicit_non_string_front_overlay_frames_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            theme_path = self.make_theme(Path(temp_dir))
            self.update_front_overlay(
                theme_path,
                {
                    "enabled": True,
                    "framesPath": 123,
                    "filePattern": "Front_{index}.png",
                    "startIndex": 1,
                    "zeroPad": 3,
                    "frameCount": 2,
                    "fps": 10,
                },
            )

            errors, _warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertTrue(any("mainScene.frontOverlay: invalid frontOverlay config" == line for line in errors))

    def test_rejects_explicit_list_front_overlay_file_pattern(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            theme_path = self.make_theme(Path(temp_dir))
            self.update_front_overlay(
                theme_path,
                {
                    "enabled": True,
                    "framesPath": "props/main/front",
                    "filePattern": ["Front_{index}.png"],
                    "startIndex": 1,
                    "zeroPad": 3,
                    "frameCount": 2,
                    "fps": 10,
                },
            )

            errors, _warnings, _summary = self.analyze_with_temp_theme(theme_path)

        self.assertTrue(any("mainScene.frontOverlay: invalid frontOverlay config" == line for line in errors))


if __name__ == "__main__":
    unittest.main()
