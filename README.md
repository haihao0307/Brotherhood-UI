# Brotherhood-UI

**Languages:** [English](#english) | [繁體中文](#繁體中文)

---
![songjiang_researching](https://github.com/user-attachments/assets/02431dbb-549d-449c-b49b-1c34473f4e15)![linchong_syncing](https://github.com/user-attachments/assets/30271876-506a-4578-bf1b-e96a3e64db0a)![wuyong_writing](https://github.com/user-attachments/assets/b53ce5bb-f696-4314-8133-dd3b9d465c22)![linchong_syncing](https://github.com/user-attachments/assets/b4bd7893-b8b2-48b9-8db8-39707fbf7823)![luzhishen_error](https://github.com/user-attachments/assets/afe5044a-054d-46c0-a4df-8fed75bb4879)

## English

### Turn OpenClaw into a live Liangshan stage.

Brotherhood-UI turns OpenClaw's natural-language workflow into a live pixel-art stage inspired by *Water Margin*.

> This is not just a status board. It is a visual performance layer for AI workflow.

Originally based on [ringhyacinth/Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI), this project has evolved far beyond a theme reskin.  
Its current goal is to map the user's conversation with OpenClaw into a real-time Liangshan-themed UI, where different task phases are handled by different heroes, and each state is expressed through animation, positioning, scene layering, props, and music. The result is a board that lets users instantly understand whether OpenClaw is researching, writing, executing, syncing, or recovering from errors, even without reading logs.

### Core Idea

- Natural language in, Liangshan performance out
- Different task phases are handled by different heroes
- The UI communicates state through animation, position, props, and music, not text alone

### Project Positioning

This project focuses on the full pipeline:

```text
OpenClaw natural-language task -> task routing -> hero/scene mapping -> real-time UI performance
```

In one sentence:

> Turn OpenClaw's internal state into something users can see and understand instantly.

### Current State Mapping

| State | Hero | Meaning |
| --- | --- | --- |
| `idle` | Song Jiang | Waiting, paused, or returned to standby after completion |
| `writing` | Wu Yong | Writing docs, prompts, copy, or structured text |
| `researching` | Song Jiang | Researching docs, references, and solution directions |
| `executing` | Wu Song | Coding, implementing, running commands, making changes |
| `syncing` | Lin Chong | Syncing, uploading, integrating, delivering |
| `error` | Lu Zhishen | Errors, failures, incidents, emergency recovery |

### What Makes This Project Different

- Natural-language driven routing instead of command-only control
- Hero-based stage mapping rather than a single character for every state
- Live animated performance with movement, state transitions, layering, and audio
- Theme-driven frontend powered by `frontend/themes/liangshan/theme.json`
- Built for OpenClaw workflow through `route_task.py` and `task_board.py`
- Designed to evolve from rule-based routing into stronger intent understanding

### Core Pipeline

```text
User natural language
  -> route_task.py / docs/task-routing-rules.md
  -> routed state and hero
  -> task_board.py / state.json
  -> backend/app.py
  -> frontend/js/theme-engine.js
  -> hero animation + props + music
```

### Current Capabilities

- 6 core states: `idle / writing / researching / executing / syncing / error`
- Dual-actor structure: one main hero plus one summoned support hero
- Layered rendering for background, foreground, actors, and props
- Animated props via spritesheets
- Automatic audio lookup using `<role>_<state>.mp3`
- Natural-language task routing
- Task lifecycle driving through `start / step / done / fail`
- Asset sync tooling for `theme.json`
- Multi-agent collaboration endpoints through `join-agent` and `agent-push`

### Key Differences From the Original Project

- Single `liangshan` theme only
- Shifted from “pixel office status board” to “Liangshan workflow performance board”
- Added `route_task.py` and `docs/task-routing-rules.md` for natural-language routing
- Added `task_board.py` for continuous task lifecycle synchronization
- `theme.json` is now the central scene configuration entry
- Added `sync_agent_theme.py` for asset workflow

### Quick Start

Install dependencies:

```bash
python -m pip install -r backend/requirements.txt
```

Start the backend:

```bash
python backend/app.py
```

Default URL:

```text
http://127.0.0.1:18791
```

Manual state test:

```bash
python set_state.py idle "Standby"
python set_state.py writing "Wu Yong is writing"
python set_state.py researching "Song Jiang is researching"
python set_state.py executing "Wu Song is implementing"
python set_state.py syncing "Lin Chong is syncing"
python set_state.py error "Lu Zhishen is handling an error"
```

### Drive the UI With Natural Language

Task routing only:

```powershell
python route_task.py "Help me change the homepage button color and implement it"
python route_task.py "Help me inspect the OpenClaw docs structure"
python route_task.py "Sync the local progress to the remote board"
```

Apply the routed result directly:

```powershell
python route_task.py "Help me change the homepage button color and implement it" --apply
```

Drive the full task lifecycle:

```powershell
python task_board.py start "Help me inspect the OpenClaw docs structure"
python task_board.py step executing "Wu Song is implementing the task"
python task_board.py done "Task completed, back to standby"
```

Recommended flow:

1. Run `task_board.py start "<original user request>"` when a task begins
2. Run `task_board.py step ...` when the task phase changes
3. Run `task_board.py done "..."` on success
4. Run `task_board.py fail "..."` on failure or blockage

### Theme System

Theme directory:

```text
frontend/themes/liangshan/
```

Key configuration nodes:

- `mainHero`
- `supportHeroes`
- `slots`
- `stateScenes`
- `objects`

Most visual changes can be made by replacing assets and editing `theme.json` without rewriting frontend logic.

### Asset Sync Tool

GUI mode:

```powershell
python sync_agent_theme.py --gui
```

CLI examples:

```powershell
python sync_agent_theme.py --input frontend/themes/liangshan/wusong_idle.gif
python sync_agent_theme.py --input E:\your-frames-folder --output E:\output\wusong_idle-spritesheet.png
python sync_agent_theme.py --input frontend/themes/liangshan/wuyong_writing-spritesheet.png --frame-count 9 --frame-rate 4 --sync --theme-json frontend/themes/liangshan/theme.json --target-kind support --hero-id wuyong --state-key writing
```

### Backend Endpoints

- `GET /`
- `GET /status`
- `POST /set_state`
- `GET /yesterday-memo`
- `POST /join-agent`
- `POST /agent-push`
- `GET /agents`

### Repository Structure

```text
Brotherhood-UI/
  backend/
  docs/
    task-routing-rules.md
  frontend/
    css/
    js/
    themes/
      liangshan/
        theme.json
        props/
        audio/
  route_task.py
  task_board.py
  set_state.py
  sync_agent_theme.py
  office-agent-push.py
```

### Good Fit For

- OpenClaw state visualization
- AI workflow observability
- Agent dashboards and desktop assistants
- Stylized UI projects instead of generic admin panels

### Roadmap

- Stronger natural-language routing beyond keyword rules
- Finer task-state modeling and a more stable state machine
- More complete Liangshan character asset replacement
- Richer props, music, and event performance
- Deeper automatic integration with OpenClaw

---

## 繁體中文

### Turn OpenClaw into a live Liangshan stage.

把 OpenClaw 的自然語言任務過程，即時翻譯成一塊會「演戲」的梁山像素看板。

> 這不只是狀態展示，而是把 AI 的工作流程變成使用者看得懂、聽得到、感受得到的現場演出。

Brotherhood-UI 基於 [ringhyacinth/Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI) 二次開發，但現在已經不是單純的換皮專案。  
它目前的目標，是把使用者與 OpenClaw 的自然語言互動，映射成一套可即時感知的梁山主題 UI：不同任務階段由不同英雄接手，不同狀態對應不同動畫、站位、場景層次、道具與音樂，讓使用者即使不看日誌，也能直觀知道 AI 現在是在查資料、寫內容、動手執行、同步協作，還是在緊急救火。

### 核心表達

- 自然語言進，梁山演出出
- 不同任務狀態，對應不同英雄接手
- UI 不只顯示文字，而是用動畫、站位、道具、音樂一起傳達狀態

### 專案定位

這個專案要解決的是：

```text
OpenClaw 自然語言任務 -> 狀態路由 -> 英雄/場景映射 -> 前端即時演出
```

一句話概括：

> 讓 OpenClaw 的內部狀態，變成使用者可以一眼看懂的「梁山現場」。

### 目前演出映射

| 狀態 | 英雄 | 含義 |
| --- | --- | --- |
| `idle` | 宋江 | 待命、暫停、任務完成後回堂前 |
| `writing` | 吳用 | 寫文案、寫說明、整理文件、寫提示詞 |
| `researching` | 宋江 | 查資料、看文件、做調研、分析方案 |
| `executing` | 武松 | 改程式、做頁面、跑命令、真正落地 |
| `syncing` | 林沖 | 同步、上傳、聯調、版本流轉、交付 |
| `error` | 魯智深 | 報錯、失敗、線上事故、緊急救火 |

### 這個專案最特別的地方

- 自然語言驅動：使用者原話不需要先轉成固定命令
- 梁山角色映射：不同任務階段由不同英雄出場
- 動態演出：人物會移動、切換狀態動畫、切換場景層次與音效
- 配置驅動主題：前端主場景由 `frontend/themes/liangshan/theme.json` 驅動
- 面向 OpenClaw 工作流：提供 `route_task.py` 與 `task_board.py`
- 可持續擴充：後續可以從關鍵字規則升級到更強的意圖辨識

### 核心鏈路

```text
使用者自然語言
  -> route_task.py / docs/task-routing-rules.md
  -> 狀態與英雄
  -> task_board.py / state.json
  -> backend/app.py
  -> frontend/js/theme-engine.js
  -> 梁山角色動畫 + 場景道具 + 音樂
```

### 目前能力

- 支援 6 個核心狀態：`idle / writing / researching / executing / syncing / error`
- 支援「主將常駐 + 單副將召將」的雙演員結構
- 支援背景、前景、角色、道具分層
- 支援 props spritesheet 動畫道具
- 音訊依照 `<role>_<state>.mp3` 自動匹配
- 支援自然語言任務路由
- 支援任務生命週期驅動：`start / step / done / fail`
- 支援將 spritesheet 資源同步到 `theme.json`
- 支援 `join-agent` / `agent-push` 多 Agent 協作介面

### 與原專案的主要差異

- 只保留 `liangshan` 單一主題
- 視覺表達從「辦公室狀態面板」轉向「梁山任務演出面板」
- 新增 `route_task.py` 與 `docs/task-routing-rules.md`
- 新增 `task_board.py` 以持續推送任務生命週期
- `theme.json` 已成為場景核心配置入口
- 新增素材同步工具 `sync_agent_theme.py`

### 快速開始

安裝依賴：

```bash
python -m pip install -r backend/requirements.txt
```

啟動後端：

```bash
python backend/app.py
```

預設位址：

```text
http://127.0.0.1:18791
```

直接切換狀態測試：

```bash
python set_state.py idle "待命中"
python set_state.py writing "吳用正在整理文案"
python set_state.py researching "宋江正在查資料"
python set_state.py executing "武松正在動手實作"
python set_state.py syncing "林沖正在同步資訊"
python set_state.py error "魯智深正在救火"
```

### 用自然語言驅動 UI

只做任務路由：

```powershell
python route_task.py "幫我改一下首頁按鈕顏色並直接落地"
python route_task.py "幫我查一下 OpenClaw 的文件結構"
python route_task.py "把本地進度同步到遠端看板"
```

匹配後直接更新狀態：

```powershell
python route_task.py "幫我改一下首頁按鈕顏色並直接落地" --apply
```

驅動完整任務生命週期：

```powershell
python task_board.py start "幫我查一下 OpenClaw 的文件結構"
python task_board.py step executing "武松出陣，正在動手實作"
python task_board.py done "任務完成，回到待命"
```

推薦工作流：

1. 收到任務先執行 `task_board.py start "<使用者原話>"`
2. 階段變化時執行 `task_board.py step ...`
3. 成功結束時執行 `task_board.py done "..."`
4. 失敗或阻塞時執行 `task_board.py fail "..."`

### 主題系統

主題目錄：

```text
frontend/themes/liangshan/
```

關鍵配置：

- `mainHero`
- `supportHeroes`
- `slots`
- `stateScenes`
- `objects`

大部分視覺層調整都可以透過替換素材與編輯 `theme.json` 完成，不需要頻繁改動前端邏輯。

### 素材同步工具

GUI 模式：

```powershell
python sync_agent_theme.py --gui
```

命令列範例：

```powershell
python sync_agent_theme.py --input frontend/themes/liangshan/wusong_idle.gif
python sync_agent_theme.py --input E:\your-frames-folder --output E:\output\wusong_idle-spritesheet.png
python sync_agent_theme.py --input frontend/themes/liangshan/wuyong_writing-spritesheet.png --frame-count 9 --frame-rate 4 --sync --theme-json frontend/themes/liangshan/theme.json --target-kind support --hero-id wuyong --state-key writing
```

### 後端介面

- `GET /`
- `GET /status`
- `POST /set_state`
- `GET /yesterday-memo`
- `POST /join-agent`
- `POST /agent-push`
- `GET /agents`

### 倉庫結構

```text
Brotherhood-UI/
  backend/
  docs/
    task-routing-rules.md
  frontend/
    css/
    js/
    themes/
      liangshan/
        theme.json
        props/
        audio/
  route_task.py
  task_board.py
  set_state.py
  sync_agent_theme.py
  office-agent-push.py
```

### 適合什麼場景

- 你想把 OpenClaw 的狀態做成更直觀的桌面可視化
- 你想讓 AI 工作過程更「可見」
- 你正在做 AI Agent、桌面助理、辦公看板、任務演出類專案
- 你想做強主題化 UI，而不是通用後台面板

### 未來方向

- 更強的自然語言路由，不只靠關鍵字
- 更細的任務階段拆分與更穩定的狀態機
- 更完整的梁山角色素材替換
- 更豐富的場景道具、音樂與事件演出
- 與 OpenClaw 更深入的自動整合
