# Brotherhood-UI

<div align="center">
  <img src="./logo.png" alt="Brotherhood-UI logo" width="140" />
  <p><strong>Turn OpenClaw into a live Liangshan stage with a single-screen narrative UI.</strong></p>
  <p>
    <a href="https://github.com/haihao0307/Brotherhood-UI"><img src="https://img.shields.io/badge/GitHub-Brotherhood--UI-181717?style=flat-square&logo=github" alt="GitHub" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square" alt="License" /></a>
    <img src="https://img.shields.io/badge/OpenClaw-Local%20Auto%20Sync-0F766E?style=flat-square" alt="OpenClaw local auto sync" />
    <img src="https://img.shields.io/badge/Launcher-Shared%20Runtime-B91C1C?style=flat-square" alt="Launcher shared runtime" />
    <img src="https://img.shields.io/badge/Windows%20%2B%20macOS-Supported-2563EB?style=flat-square" alt="Windows and macOS supported" />
    <img src="https://img.shields.io/badge/Pixel%20Stage-Liangshan-F59E0B?style=flat-square" alt="Liangshan pixel stage" />
    <img src="https://img.shields.io/badge/UI-Single%20Screen%20Narrative-7C3AED?style=flat-square" alt="Single-screen narrative UI" />
    <img src="https://img.shields.io/badge/I18N-zh--Hant%20%2F%20English-0EA5E9?style=flat-square" alt="Traditional Chinese and English UI" />
  </p>
  <img src="./banner.png" alt="Brotherhood-UI banner" width="100%" />
</div>

**Languages:** [English](#english) | [繁體中文](#繁體中文)

---

## English

### What It Is

Brotherhood-UI is a Water Margin-inspired visual layer for OpenClaw.

Instead of showing AI workflow as a plain dashboard, the current version turns it into a staged performance with:

- a single-screen layout built around the main pixel stage
- a narrative status strip that keeps the current state readable without relying on transient bubbles
- secondary tools moved into a floating drawer so the stage stays visually dominant
- local OpenClaw session mirroring, hero handoff, child scenes, dialogue, and music working as one runtime

The project started from [ringhyacinth/Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI), but the current version is no longer a simple reskin. It is now a scene-driven workflow board with stronger state coordination, bilingual UI, and creator-facing verification tooling.

### Current Version Highlights

- **Single-screen stage-first layout**
  The canvas remains the visual focus, while the lower area is compressed into a compact narrative strip plus a top-right tools drawer. On a typical desktop setup such as `1600x900`, the main stage, status strip, and top bar fit without default scrolling.
- **Narrative status strip**
  The lower band is no longer a one-line status toy. It now renders a strong headline, stage narration, task focus, recent history, and a bottom live readout so OpenClaw status can be read continuously and matched against the upper-scene performance.
- **Bilingual runtime**
  The UI now supports `繁體中文` and `English`, with `zh-Hant` as the default. Fixed UI chrome, state labels, and generated system narration all switch language at runtime, while task detail and memo body can stay in their original text.
- **Cross-platform typography**
  Typography has been tuned separately for Windows and macOS, with dedicated font stacks and locale-specific spacing/line-height rules for `zh-Hant` and `en`, including maximized browser windows and the launcher’s taller vertical layout.
- **OpenClaw-aware orchestration**
  Local OpenClaw activity is mirrored into the board through a single-writer state bus, hero handoff scenes, idle random events, roaming support heroes, and aggregated status/history feeds.
- **Built-in verification**
  The repo ships with doctors, consistency checks, asset acceptance, and frontend regression coverage, so the current UI is not just stylized but operationally maintained.

### Current State Mapping

| State | Hero | Meaning |
| --- | --- | --- |
| `idle` | Song Jiang | standby, waiting, or returned from a finished task |
| `researching` | Sun Erniang | reading docs, digging for clues, finding hidden details |
| `writing` | Wu Yong | writing copy, prompts, docs, structured text |
| `executing` | Wu Song | coding, implementing, running commands, making changes |
| `syncing` | Lin Chong | syncing, integrating, shipping, handing work off |
| `error` | Lu Zhishen | failure, incident, emergency recovery |

### What The Current Version Already Does

- Mirrors local OpenClaw sessions into the board automatically
- Exposes a `GET /status-feed` aggregation path for the narrative strip
- Keeps a persistent main scene with Song Jiang plus all support heroes
- Switches into hero-specific child scenes per active workflow state
- Supports idle random dialogue events and roaming support heroes in the main scene
- Uses a compact status strip with headline, stage narration, focus, recent history, and live readout
- Moves control panel and yesterday memo into a floating secondary drawer
- Supports `zh-Hant` / `English` runtime switching with localized hero naming and state narration
- Uses a single-writer state bus instead of multiple scripts racing to overwrite `state.json`
- Ships with asset doctors, theme consistency checks, docs consistency checks, regression checks, and a combined acceptance check

### Architecture In One Line

```text
OpenClaw session / manual event -> state bus -> backend status -> scene runtime -> hero + subscene performance
```

### Recommended Start

#### Windows

Install once:

```powershell
python -m pip install -r backend/requirements.txt
```

Start with the launcher:

```powershell
.\Brotherhood-UI Launcher.bat
```

Or use the shared control runtime directly:

```powershell
python brotherhood_control_runtime.py auto
python brotherhood_control_runtime.py doctor
python brotherhood_control_runtime.py regression
python brotherhood_control_runtime.py asset-check
python brotherhood_control_runtime.py stop
```

#### macOS

Install once:

```bash
python3 -m pip install -r backend/requirements.txt
```

Start the same GUI runtime directly:

```bash
python3 brotherhood_ui_launcher.py
```

Or use the shared control runtime:

```bash
python3 brotherhood_control_runtime.py auto
python3 brotherhood_control_runtime.py doctor
python3 brotherhood_control_runtime.py regression
python3 brotherhood_control_runtime.py asset-check
python3 brotherhood_control_runtime.py stop
```

### OpenClaw Integration

The current local sync path is:

- [openclaw_session_watch.py](./openclaw_session_watch.py) watches the active local OpenClaw session
- [openclaw_activity_adapter.py](./openclaw_activity_adapter.py) resolves explicit activity hints first, then safe fallback mappings
- [state_event_bus.py](./state_event_bus.py) records events
- [state_coordinator.py](./state_coordinator.py) is the only writer of `state.json`
- [backend/app.py](./backend/app.py) serves the current snapshot to the frontend

If you want manual lifecycle injection, keep using:

```powershell
python openclaw_bridge.py start "Help me inspect the OpenClaw docs structure"
python openclaw_bridge.py phase "Reading the docs and organizing the plan"
python openclaw_bridge.py done "Task completed"
```

Detailed notes live in `docs/openclaw-integration.md`.

### Asset Workflow

Replace assets in-place, then run the fixed checks:

```powershell
python generate_asset_docs.py
python asset_delivery_doctor.py
type .\docs\asset-status.md
python docs_consistency_doctor.py
python check_theme_consistency.py
python asset_acceptance_check.py
type .\docs\asset-acceptance-report.md
```

Or use the shared acceptance command:

```powershell
python brotherhood_control_runtime.py asset-check
```

Current fixed state-audio names:

```text
state_idle.mp3
state_researching.mp3
state_writing.mp3
state_executing.mp3
state_syncing.mp3
state_error.mp3
```

Folder rules:

- `frontend/themes/liangshan/props/main/`
  main-scene props only
- `frontend/themes/liangshan/subscenes/<scene>/bg.png`
  child-scene background
- `frontend/themes/liangshan/subscenes/<scene>/props/`
  props for that child scene only

References:

- `docs/asset-workflow.md`
- `docs/asset-status.md` (generated)
- `frontend/themes/liangshan/PLACE_ASSETS_HERE.txt`
- `frontend/themes/liangshan/audio/PLACE_AUDIO_HERE.txt`
- `frontend/themes/liangshan/asset-manifest.json`

### Built-In Verification

The repo now has 3 fixed verification layers:

1. Asset and docs checks
2. Theme and semantic consistency checks
3. Frontend behavior regression

Run the frontend regression directly:

```powershell
python brotherhood_control_runtime.py regression
```

It verifies:

- `idle -> handoff -> child scene -> idle`
- Song Jiang seeded first idle random event
- support hero roaming unlock
- handoff selects the hero at the current roaming position
- idle random events are interrupted cleanly by a new task

### Repository Structure

```text
Brotherhood-UI/
  backend/
  docs/
    asset-workflow.md
    openclaw-integration.md
    task-routing-rules.md
  frontend/
    js/
    themes/
      liangshan/
        asset-manifest.json
        theme.json
        theme-dialogues.json
        theme-main-scene-events.json
        props/
          main/
        subscenes/
        audio/
  asset_acceptance_check.py
  asset_delivery_doctor.py
  check_theme_consistency.py
  docs_consistency_doctor.py
  generate_asset_docs.py
  frontend_regression_check.js
  openclaw_activity_adapter.py
  openclaw_bridge.py
  openclaw_session_watch.py
  openclaw_sync_doctor.py
  route_task.py
  task_board.py
  set_state.py
  state_event_bus.py
  state_coordinator.py
  state_bus_doctor.py
  brotherhood_control_runtime.py
  brotherhood_ui_launcher.py
  Brotherhood-UI Launcher.bat
  brotherhood-ui.bat
  brotherhood-ui.sh
```

### Why This Version Is Different

- The board is no longer a single-character status toy
- `researching` is now owned by **Sun Erniang**
- Main scene, child scenes, idle random events, and roaming now work together as one scene system
- State writes are now coordinated through a single bus instead of many scripts racing to overwrite state
- Asset replacement is now paired with doctors, generated docs, and acceptance reports

### Roadmap

- stronger OpenClaw protocol integration
- richer finished art replacement over placeholders
- better creator-facing asset tooling
- more behavior regression coverage
- more polished main-scene and child-scene performance

---

## 繁體中文

### 這個專案現在是什麼

Brotherhood-UI 是一個把 OpenClaw 工作流程轉成「梁山現場演出」的前端可視化層。

它不是普通狀態看板，而是把 AI 的任務過程轉成一個以舞台為中心的即時敘事 UI：

- 上半部保持梁山主舞台作為第一視覺焦點
- 下半部改成可持續閱讀的敘事狀態帶，而不是一閃而過的短句
- 次要工具收進右上角工具抽屜，不再打散主版面
- 本機 OpenClaw 同步、英雄交棒、子場景切換、對白與音樂都在同一套執行時裡協同工作

專案源於 [ringhyacinth/Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI)，但目前版本已經不再是換皮，而是具有更強狀態協調、雙語能力與驗證鏈的場景化工作流看板。

### 目前版本最值得注意的特性

- **單屏舞台優先版面**
  畫布仍然是主角，下屏壓縮成緊湊狀態帶，控制面板與昨日小記收進右上角工具抽屜。像 `1600x900` 這類常見桌面尺寸，預設即可同時看到頂欄、主舞台與狀態帶。
- **主敘事狀態帶**
  現在的下屏不再只是單行狀態，而是由主標題、舞台解說、任務焦點、最近過程、即時回聲組成，可持續理解 OpenClaw 當前在做什麼，並且和上屏演出互相對位。
- **繁體中文 / English 雙語切換**
  預設為 `繁體中文`，也可即時切到 `English`。固定 UI、狀態名稱、英雄顯示名與系統敘事模板都會同步切換，動態 detail 與 memo 正文則保留原文。
- **跨平台字體與排版優化**
  針對 Windows / macOS 分別設計字體棧，並按 `zh-Hant` / `en` 拆分字距、行高與斷行策略，同時兼顧一般桌面瀏覽器、最大化視窗與 launcher 直向視窗的可讀性。
- **OpenClaw 感知式編排**
  本機 OpenClaw 活動會透過單寫入狀態總線進入 UI，配合宋江交棒、子場景執行、idle 隨機短事件、support hero roaming 與聚合狀態歷史，一起構成完整演出邏輯。
- **內建驗證鏈**
  專案內建 doctor、主題一致性檢查、素材驗收與前端回歸測試，所以目前這版不是只追求畫面，而是有持續維護能力的版本。

### 目前狀態對應

| 狀態 | 英雄 | 含義 |
| --- | --- | --- |
| `idle` | 宋江 | 待命、等待、任務完成後回堂前 |
| `researching` | 孫二娘 | 查資料、翻細節、摸線索 |
| `writing` | 吳用 | 寫文案、寫提示詞、整理說明、整理文件 |
| `executing` | 武松 | 改程式、做頁面、跑命令、真正落地 |
| `syncing` | 林沖 | 同步、整合、交付、流轉 |
| `error` | 魯智深 | 報錯、失敗、事故、緊急救火 |

### 這個版本已經具備的能力

- 自動鏡像本機 OpenClaw 會話
- 提供 `GET /status-feed` 聚合輸出給敘事狀態帶
- 宋江與全部 support hero 常駐主場景
- 每個工作狀態切入對應英雄的子場景
- 主場景 idle 隨機短事件
- support hero 主場景 roaming
- 緊湊狀態帶包含主標題、舞台解說、任務焦點、最近過程與即時回聲
- 控制面板與昨日小記改為右上角次級工具抽屜
- 支援 `zh-Hant` / `English` 即時切換，英雄名與系統敘事會一起本地化
- 自然語言桌面任務路由
- 單寫入入口狀態總線
- 素材、主題、文件、前端行為的一整套檢查鏈

### 一句話架構

```text
OpenClaw 會話 / 手動事件 -> 狀態總線 -> 後端狀態快照 -> 場景執行時 -> 英雄與子場景演出
```

### 推薦啟動方式

#### Windows

先安裝一次依賴：

```powershell
python -m pip install -r backend/requirements.txt
```

用 Launcher 啟動：

```powershell
.\Brotherhood-UI Launcher.bat
```

或直接使用共用控制入口：

```powershell
python brotherhood_control_runtime.py auto
python brotherhood_control_runtime.py doctor
python brotherhood_control_runtime.py regression
python brotherhood_control_runtime.py asset-check
python brotherhood_control_runtime.py stop
```

#### macOS

先安裝一次依賴：

```bash
python3 -m pip install -r backend/requirements.txt
```

直接啟動同一套 GUI 執行時：

```bash
python3 brotherhood_ui_launcher.py
```

或直接使用共用控制入口：

```bash
python3 brotherhood_control_runtime.py auto
python3 brotherhood_control_runtime.py doctor
python3 brotherhood_control_runtime.py regression
python3 brotherhood_control_runtime.py asset-check
python3 brotherhood_control_runtime.py stop
```

### OpenClaw 自動同步

目前本機同步鏈路是：

- [openclaw_session_watch.py](./openclaw_session_watch.py) 監看當前 OpenClaw 會話
- [openclaw_activity_adapter.py](./openclaw_activity_adapter.py) 優先解析顯式活動提示，再回退到安全映射
- [state_event_bus.py](./state_event_bus.py) 記錄事件
- [state_coordinator.py](./state_coordinator.py) 作為唯一 `state.json` 寫入者
- [backend/app.py](./backend/app.py) 把最終快照提供給前端

如果你要手動注入生命週期，也可以繼續用：

```powershell
python openclaw_bridge.py start "幫我查一下 OpenClaw 文件結構"
python openclaw_bridge.py phase "正在讀文件並整理方案"
python openclaw_bridge.py done "任務完成"
```

詳細說明見 `docs/openclaw-integration.md`。

### 素材替換流程

直接同名覆蓋素材，然後固定跑這條鏈：

```powershell
python generate_asset_docs.py
python asset_delivery_doctor.py
type .\docs\asset-status.md
python docs_consistency_doctor.py
python check_theme_consistency.py
python asset_acceptance_check.py
type .\docs\asset-acceptance-report.md
```

或直接用共用驗收命令：

```powershell
python brotherhood_control_runtime.py asset-check
```

目前固定的狀態音檔命名：

```text
state_idle.mp3
state_researching.mp3
state_writing.mp3
state_executing.mp3
state_syncing.mp3
state_error.mp3
```

目錄規則：

- `frontend/themes/liangshan/props/main/`
  主場景道具
- `frontend/themes/liangshan/subscenes/<scene>/bg.png`
  子場景背景
- `frontend/themes/liangshan/subscenes/<scene>/props/`
  該子場景專屬道具

參考文件：

- `docs/asset-workflow.md`
- `docs/asset-status.md`（生成檔）
- `frontend/themes/liangshan/PLACE_ASSETS_HERE.txt`
- `frontend/themes/liangshan/audio/PLACE_AUDIO_HERE.txt`
- `frontend/themes/liangshan/asset-manifest.json`

### 內建驗證鏈

目前已固定成 3 層：

1. 素材與文件檢查
2. 主題與語義一致性檢查
3. 前端行為回歸測試

直接跑前端回歸：

```powershell
python brotherhood_control_runtime.py regression
```

它會驗證：

- `idle -> handoff -> child scene -> idle`
- 宋江第一條 idle 隨機短事件
- support hero roaming 解鎖
- handoff 時保留 support hero 當前站位
- idle 隨機短事件被新任務乾淨打斷

### 倉庫結構

```text
Brotherhood-UI/
  backend/
  docs/
    asset-workflow.md
    openclaw-integration.md
    task-routing-rules.md
  frontend/
    js/
    themes/
      liangshan/
        asset-manifest.json
        theme.json
        theme-dialogues.json
        theme-main-scene-events.json
        props/
          main/
        subscenes/
        audio/
  asset_acceptance_check.py
  asset_delivery_doctor.py
  check_theme_consistency.py
  docs_consistency_doctor.py
  generate_asset_docs.py
  frontend_regression_check.js
  openclaw_activity_adapter.py
  openclaw_bridge.py
  openclaw_session_watch.py
  openclaw_sync_doctor.py
  route_task.py
  task_board.py
  set_state.py
  state_event_bus.py
  state_coordinator.py
  state_bus_doctor.py
  brotherhood_control_runtime.py
  brotherhood_ui_launcher.py
  Brotherhood-UI Launcher.bat
  brotherhood-ui.bat
  brotherhood-ui.sh
```

### 這個版本主要改動

- 已經不是單角色狀態看板
- `researching` 已正式交給 **孫二娘**
- 主場景、子場景、隨機事件、roaming 已組成一套完整演出邏輯
- 狀態層已改成單寫入入口，不再多腳本互搶 `state.json`
- 素材替換已有檢查器、生成說明、驗收報告，不再靠記憶維護

### 後續方向

- 更穩定的 OpenClaw 協議層整合
- 更多 placeholder 被正式素材替換
- 更適合創作者的素材工具
- 更完整的行為回歸覆蓋
- 更細膩的主場景與子場景polish
