# OpenClaw Integration

This repository now includes two integration layers:

- `openclaw_bridge.py`
  - Manual lifecycle bridge
  - Good for scripted or explicit state updates
- `openclaw_session_watch.py`
  - Automatic local OpenClaw session watcher
  - Watches the local OpenClaw session JSONL file and mirrors activity into `state.json`

## What runs the board

- `openclaw_bridge.py`
  - Thin lifecycle bridge for manual lifecycle commands
- `openclaw_session_watch.py`
  - Automatic watcher for local OpenClaw sessions
  - Reads the active session from `%USERPROFILE%\.openclaw\agents\main\sessions\sessions.json`
  - Follows the current session file and syncs user prompts, tool calls, and final replies
- `task_board.py`
  - State lifecycle entry point
- `route_task.py`
  - Natural-language routing using `docs/task-routing-rules.md`
- `backend/app.py`
  - Serves `/status`
- `frontend/`
  - Renders the Liangshan stage from `state.json`

## Minimum working flow

Inside the Brotherhood-UI workspace:

```powershell
python openclaw_bridge.py start "帮我检查 OpenClaw 的文档结构并梳理方案"
python openclaw_bridge.py phase "正在查阅 OpenClaw 文档并梳理目录"
python openclaw_bridge.py phase "正在落地实现前端映射逻辑"
python openclaw_bridge.py done "任务完成，梁山暂且无事"
```

## Beginner-friendly Windows usage

If you are on Windows, use the wrapper instead:

```powershell
.\brotherhood-ui.bat serve
.\brotherhood-ui.bat watch
.\brotherhood-ui.bat open
```

Or start everything in one go:

```powershell
.\brotherhood-ui.bat auto
```

Check wiring and health any time:

```powershell
.\brotherhood-ui.bat doctor
```

Stop the helper-managed backend and watcher:

```powershell
.\brotherhood-ui.bat stop
```

If you still want manual lifecycle testing, keep using:

```powershell
.\brotherhood-ui.bat start "帮我检查 OpenClaw 的文档结构并梳理方案"
.\brotherhood-ui.bat phase "正在查阅 OpenClaw 文档并梳理目录"
.\brotherhood-ui.bat phase "正在落地实现前端映射逻辑" --state executing
.\brotherhood-ui.bat done "任务完成，梁山暂且无事"
```

Run this any time to see the current board state:

```powershell
.\brotherhood-ui.bat status
```

## Automatic local sync

For local OpenClaw web chat, the recommended path is now:

1. Start the Brotherhood backend
2. Start `openclaw_session_watch.py`
3. Talk to OpenClaw normally in the browser
4. Let the watcher mirror the active session into Brotherhood-UI automatically

The watcher currently reads:

- `%USERPROFILE%\.openclaw\agents\main\sessions\sessions.json`
- The active `agent:main:main` session file referenced there

It maps:

- user prompt -> `start`
- tool call -> `phase`
- assistant final text -> `done`
- prompt/tool failure -> `fail`

## Activity protocol

The watcher now prefers an explicit activity protocol over tool-name guessing.

Priority order:

1. Explicit protocol payloads
2. Explicit state hints inside tool arguments
3. Configured tool-family fallback
4. Observe-only note without changing UI state

The protocol file is:

- `openclaw-activity-protocol.json`

It defines:

- which tool families map to `researching / writing / executing / syncing`
- which tools are observe-only
- which keys are treated as explicit state hints
- which custom event types can directly drive Brotherhood-UI

### Preferred explicit protocol shapes

Inside tool arguments or custom event payloads:

```json
{
  "brotherhood": {
    "command": "phase",
    "state": "writing",
    "note": "正在整理首頁 README"
  }
}
```

Or assistant text can embed:

```text
BROTHERHOOD_UI: {"command":"phase","state":"executing","note":"正在執行本地腳本"}
```

Supported commands:

- `phase`
- `done`
- `fail`

If an explicit protocol payload is present, the watcher uses it directly and stops relying on tool-name inference for that event.

`AGENTS.md` is still kept in the repo as a secondary integration path, but the file watcher is the reliable path for your current local deployment.

## Phase routing behavior

`openclaw_bridge.py phase "<note>"` will:

- Try to route the note through `docs/task-routing-rules.md`
- Write the inferred `state`, `hero`, and current note into `state.json`
- Fall back to `researching` when no rule matches

If OpenClaw already knows the exact phase, it can use:

```powershell
python openclaw_bridge.py phase "正在实现按钮交互" --state executing
```

You can inspect the watcher mode with:

```powershell
python openclaw_sync_doctor.py
```

Look for:

- `Protocol mode`
- `Protocol command`
- `Activity source`
