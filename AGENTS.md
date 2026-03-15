# Brotherhood-UI Agent Contract

When working inside this repository, always sync OpenClaw task progress to the UI board.

## Required lifecycle

1. Before doing real work on a new user request, run:

```powershell
python openclaw_bridge.py start "<original user request>"
```

2. When the work phase changes, run either:

```powershell
python openclaw_bridge.py phase "<what you are doing right now>"
```

or, if you already know the exact target state:

```powershell
python openclaw_bridge.py phase "<what you are doing right now>" --state researching
python openclaw_bridge.py phase "<what you are doing right now>" --state writing
python openclaw_bridge.py phase "<what you are doing right now>" --state executing
python openclaw_bridge.py phase "<what you are doing right now>" --state syncing
python openclaw_bridge.py phase "<what you are doing right now>" --state error
```

3. On success, run:

```powershell
python openclaw_bridge.py done "任务完成，梁山暂且无事"
```

4. On failure or blockage, run:

```powershell
python openclaw_bridge.py fail "执行受阻，鲁智深正在救火"
```

## Rules

- Do not start implementation before the `start` command has updated the board.
- Do not leave the board stuck in `researching`, `writing`, `executing`, `syncing`, or `error` after the task has ended.
- Do not edit `state.json` manually unless the bridge and task scripts are unavailable.
- Prefer `openclaw_bridge.py phase "<natural-language note>"` when possible so the phase can be routed automatically through `docs/task-routing-rules.md`.
