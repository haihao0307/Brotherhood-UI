import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from sync_agent_theme import (
    get_front_overlay_target,
    inspect_front_overlay_folder,
    remove_front_overlay_config,
    sync_front_overlay_config,
)


class FrontOverlayTargetTests(unittest.TestCase):
    def test_main_scene_overlay_target_uses_main_front_folder(self):
        result = get_front_overlay_target(Path("frontend/themes/liangshan/theme.json"), "main")
        self.assertEqual(result["owner"], "main")
        self.assertEqual(result["framesPath"], "props/main/front")
        self.assertTrue(str(result["folder"]).endswith("frontend\\themes\\liangshan\\props\\main\\front"))

    def test_child_scene_overlay_target_uses_subscene_front_folder(self):
        result = get_front_overlay_target(Path("frontend/themes/liangshan/theme.json"), "writing")
        self.assertEqual(result["owner"], "writing")
        self.assertEqual(result["framesPath"], "subscenes/wuyong_writing/front")
        self.assertTrue(str(result["folder"]).endswith("frontend\\themes\\liangshan\\subscenes\\wuyong_writing\\front"))


class FrontOverlayInspectionTests(unittest.TestCase):
    def test_inspection_accepts_contiguous_1280x720_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for index in range(1, 4):
                Image.new("RGBA", (1280, 720), (0, 0, 0, 0)).save(folder / f"Front_{index:03d}.png")
            result = inspect_front_overlay_folder(folder, expected_frame_count=3)
            self.assertEqual(result["frameCount"], 3)
            self.assertEqual(result["fpsSafeDefault"], 10)

    def test_inspection_rejects_gap_in_frame_numbers(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            Image.new("RGBA", (1280, 720), (0, 0, 0, 0)).save(folder / "Front_001.png")
            Image.new("RGBA", (1280, 720), (0, 0, 0, 0)).save(folder / "Front_003.png")
            with self.assertRaisesRegex(ValueError, "Front_002.png"):
                inspect_front_overlay_folder(folder, expected_frame_count=2)


class FrontOverlayThemeSyncTests(unittest.TestCase):
    def test_sync_front_overlay_writes_normalized_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            theme_path = Path(tmp) / "theme.json"
            theme_path.write_text(
                json.dumps(
                    {
                        "mainScene": {"background": {"png": "/static/themes/liangshan/bg.png"}},
                        "subscenes": {
                            "writing": {
                                "background": {"png": "/static/themes/liangshan/subscenes/wuyong_writing/bg.png"}
                            }
                        },
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            result = sync_front_overlay_config(
                theme_json_path=theme_path,
                scene_key="writing",
                frame_count=12,
                fps=10,
            )
            self.assertEqual(result["sceneKey"], "writing")
            theme = json.loads(theme_path.read_text(encoding="utf-8"))
            self.assertEqual(theme["subscenes"]["writing"]["frontOverlay"]["framesPath"], "subscenes/wuyong_writing/front")
            self.assertEqual(theme["subscenes"]["writing"]["frontOverlay"]["frameCount"], 12)
            self.assertEqual(theme["subscenes"]["writing"]["frontOverlay"]["fps"], 10)
            self.assertEqual(theme["subscenes"]["writing"]["frontOverlay"]["depth"], 5000)

    def test_sync_front_overlay_overwrites_existing_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            theme_path = Path(tmp) / "theme.json"
            theme_path.write_text(
                json.dumps(
                    {
                        "mainScene": {
                            "background": {"png": "/static/themes/liangshan/bg.png"},
                            "frontOverlay": {"enabled": False, "framesPath": "old/path", "frameCount": 1, "fps": 1},
                        },
                        "subscenes": {},
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            sync_front_overlay_config(theme_json_path=theme_path, scene_key="main", frame_count=8, fps=12)
            theme = json.loads(theme_path.read_text(encoding="utf-8"))
            self.assertEqual(theme["mainScene"]["frontOverlay"]["framesPath"], "props/main/front")
            self.assertEqual(theme["mainScene"]["frontOverlay"]["frameCount"], 8)
            self.assertTrue(theme["mainScene"]["frontOverlay"]["enabled"])


class FrontOverlayRemovalTests(unittest.TestCase):
    def test_remove_front_overlay_clears_main_config_and_deletes_pngs(self):
        with tempfile.TemporaryDirectory() as tmp:
            theme_root = Path(tmp)
            front_folder = theme_root / "props" / "main" / "front"
            front_folder.mkdir(parents=True, exist_ok=True)
            for index in range(1, 3):
                Image.new("RGBA", (1280, 720), (0, 0, 0, 0)).save(front_folder / f"Front_{index:03d}.png")
            theme_path = theme_root / "theme.json"
            theme_path.write_text(
                json.dumps(
                    {
                        "mainScene": {
                            "background": {"png": "/static/themes/liangshan/bg.png"},
                            "frontOverlay": {
                                "enabled": True,
                                "framesPath": "props/main/front",
                                "frameCount": 2,
                                "fps": 10,
                            },
                        },
                        "subscenes": {},
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            result = remove_front_overlay_config(theme_json_path=theme_path, scene_key="main")
            theme = json.loads(theme_path.read_text(encoding="utf-8"))
            self.assertNotIn("frontOverlay", theme["mainScene"])
            self.assertEqual(result["sceneKey"], "main")
            self.assertEqual(result["deletedPngCount"], 2)
            self.assertFalse((front_folder / "Front_001.png").exists())
            self.assertFalse((front_folder / "Front_002.png").exists())

    def test_remove_front_overlay_preserves_non_png_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            theme_root = Path(tmp)
            front_folder = theme_root / "subscenes" / "wuyong_writing" / "front"
            front_folder.mkdir(parents=True, exist_ok=True)
            Image.new("RGBA", (1280, 720), (0, 0, 0, 0)).save(front_folder / "Front_001.png")
            (front_folder / "notes.txt").write_text("keep", encoding="utf-8")
            theme_path = theme_root / "theme.json"
            theme_path.write_text(
                json.dumps(
                    {
                        "mainScene": {"background": {"png": "/static/themes/liangshan/bg.png"}},
                        "subscenes": {
                            "writing": {
                                "background": {"png": "/static/themes/liangshan/subscenes/wuyong_writing/bg.png"},
                                "frontOverlay": {
                                    "enabled": True,
                                    "framesPath": "subscenes/wuyong_writing/front",
                                    "frameCount": 1,
                                    "fps": 10,
                                },
                            }
                        },
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            result = remove_front_overlay_config(theme_json_path=theme_path, scene_key="writing")
            theme = json.loads(theme_path.read_text(encoding="utf-8"))
            self.assertNotIn("frontOverlay", theme["subscenes"]["writing"])
            self.assertEqual(result["deletedPngCount"], 1)
            self.assertFalse((front_folder / "Front_001.png").exists())
            self.assertTrue((front_folder / "notes.txt").exists())
