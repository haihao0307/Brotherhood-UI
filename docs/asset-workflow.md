# Asset Workflow

This document is the stable replacement workflow for Brotherhood-UI art and audio.

## Source Of Truth

- Human quick guide:
  [PLACE_ASSETS_HERE.txt](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/PLACE_ASSETS_HERE.txt)
- Audio quick guide:
  [PLACE_AUDIO_HERE.txt](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/audio/PLACE_AUDIO_HERE.txt)
- Machine-readable placeholder inventory:
  [asset-manifest.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/asset-manifest.json)

## Fixed Replacement Flow

Cross-platform control note:

- Windows and macOS now share the same Python control runtime: `brotherhood_control_runtime.py`
- `Brotherhood-UI Launcher.bat` is only a Windows convenience wrapper around the same Python GUI/runtime
- macOS can use `python3 brotherhood_ui_launcher.py` for the same GUI flow

1. Replace the target file in-place with the exact same filename.
2. Run:

```powershell
python generate_asset_docs.py
python asset_delivery_doctor.py
python docs_consistency_doctor.py
python check_theme_consistency.py
```

3. Open [asset-status.md](/E:/Codex%20Projects/Brotherhood-UI/docs/asset-status.md) and verify the generated status board.
4. If the replacement was a spritesheet and the frame size, frame count, or frame rate changed, sync `theme.json` again.
5. Open the board and visually verify the changed scene.

## Folder Meaning

- `frontend/themes/liangshan/props/main/`
  Main-scene props only.
- `frontend/themes/liangshan/subscenes/<scene>/bg.png`
  The background for one child subscene.
- `frontend/themes/liangshan/subscenes/<scene>/props/`
  Props that belong only to that child subscene.
- `frontend/themes/liangshan/audio/`
  Shared state-based theme audio files.

## When Theme Sync Is Usually Needed

Usually needed:
- Any hero spritesheet replacement
- Any walking spritesheet replacement
- Any support-hero working-state spritesheet replacement

Usually not needed:
- Replacing a subscene `bg.png` with the same path
- Replacing an mp3 with the same path
- Replacing a prop PNG with the same path and same frame config

## Recommended Commands

Windows:

```powershell
python generate_asset_docs.py
python asset_delivery_doctor.py
type .\docs\asset-status.md
python docs_consistency_doctor.py
python check_theme_consistency.py
.\Brotherhood-UI Launcher.bat
python brotherhood_control_runtime.py doctor
```

macOS:

```bash
python3 generate_asset_docs.py
python3 asset_delivery_doctor.py
cat ./docs/asset-status.md
python3 docs_consistency_doctor.py
python3 check_theme_consistency.py
python3 brotherhood_ui_launcher.py
python3 brotherhood_control_runtime.py doctor
```
