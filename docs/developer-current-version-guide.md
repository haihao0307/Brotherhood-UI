# Brotherhood-UI 当前版本开发者说明

这份文档不是对外 README，而是给当前开发者自己看的“仓库地图”。

目标只有一个：

> 看完之后，能快速重新建立对当前版本 Brotherhood-UI 的整体理解，知道根目录每个脚本、前端运行时拆分、状态总线、OpenClaw 接入和素材工具分别负责什么。

---

## 1. 先建立整体脑图

当前版本可以理解成 5 条主链：

1. **启动与控制链**
   Windows / macOS 如何启动后端、watcher、面板、回归检查、资产验收。

2. **状态总线链**
   谁可以提交状态事件，谁负责把事件折叠成最终 `state.json`。

3. **OpenClaw 接入链**
   如何从本地 OpenClaw 会话里抽取活动，再映射到 Brotherhood-UI 的状态。

4. **前端演出链**
   后端 `/status` 如何驱动主场景、handoff、子场景、随机短事件、roaming。

5. **素材与验收链**
   美术替换、音频替换、主题一致性检查、前端行为回归、总验收。

一句话架构：

```text
OpenClaw / 手动脚本
  -> 状态事件
  -> 单写入协调器
  -> state.json
  -> backend /status
  -> app.js 状态调度
  -> theme-engine.js 场景渲染
  -> 梁山角色 / 道具 / 音频演出
```

---

## 2. 根目录文件职能速览

下面这部分是最重要的。你现在如果只想知道“根目录每个文件干嘛用”，看这一节就够了。

### 启动与控制

- [Brotherhood-UI Launcher.bat](/E:/Codex%20Projects/Brotherhood-UI/Brotherhood-UI%20Launcher.bat)
  Windows 图形启动入口。只是一个薄包装，实际打开的是 Python GUI launcher。

- [brotherhood_ui_launcher.py](/E:/Codex%20Projects/Brotherhood-UI/brotherhood_ui_launcher.py)
  跨平台 GUI launcher。提供 `Start / Check / Open Board / Stop`，本质上调用统一控制运行时。

- [brotherhood-ui.bat](/E:/Codex%20Projects/Brotherhood-UI/brotherhood-ui.bat)
  Windows 命令行包装器。把参数转发给 `brotherhood_control_runtime.py`。

- [brotherhood-ui.sh](/E:/Codex%20Projects/Brotherhood-UI/brotherhood-ui.sh)
  macOS / Linux 命令行包装器。作用和 `.bat` 一样，也是转发到统一控制运行时。

- [brotherhood-ui.ps1](/E:/Codex%20Projects/Brotherhood-UI/brotherhood-ui.ps1)
  早期 Windows PowerShell 控制入口，项目里仍保留，但现在主控制核心已经转到 `brotherhood_control_runtime.py`。

- [brotherhood_control_runtime.py](/E:/Codex%20Projects/Brotherhood-UI/brotherhood_control_runtime.py)
  当前项目的**跨平台控制核心**。负责：
  - 启动后端
  - 启动 OpenClaw watcher
  - 打开网页面板
  - 跑 doctor
  - 跑 regression
  - 跑 asset-check
  - 停止 helper 管理的后台进程

### 状态总线

- [state_event_bus.py](/E:/Codex%20Projects/Brotherhood-UI/state_event_bus.py)
  低层事件存储工具。负责：
  - `.runtime/state-events/` 目录管理
  - 事件 JSON 落盘
  - `state.json` 原子写入
  - 默认状态与 runtime 路径定义

- [state_coordinator.py](/E:/Codex%20Projects/Brotherhood-UI/state_coordinator.py)
  **单写入入口协调器**。这是状态层最重要的文件。负责：
  - 接收事件
  - 按 `source / request_id / sequence / event_type` 仲裁
  - 生成最终 `state.json`
  - auto-idle
  - 事件历史瘦身

- [state_bus_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/state_bus_doctor.py)
  状态总线诊断工具。看当前快照、最近事件链、request/sequence/source 是否正常。

- [state.sample.json](/E:/Codex%20Projects/Brotherhood-UI/state.sample.json)
  示例状态文件，仅用于理解结构，不是运行时主文件。

### OpenClaw 接入

- [openclaw_session_watch.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_session_watch.py)
  监看本地 OpenClaw 会话文件的 watcher。负责：
  - 找当前 session
  - 读取 message / tool call / tool result
  - 生成 `start / phase / done / fail` 事件
  - 通过 bridge 或状态总线镜像到项目

- [openclaw_activity_adapter.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_activity_adapter.py)
  OpenClaw 活动适配层。优先吃显式协议提示，回退到安全的工具家族映射。

- [openclaw-activity-protocol.json](/E:/Codex%20Projects/Brotherhood-UI/openclaw-activity-protocol.json)
  OpenClaw 活动协议配置文件。定义哪些显式活动提示或工具家族会被映射成 Brotherhood-UI 状态。

- [openclaw_bridge.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_bridge.py)
  手动桥接入口。适合人工或外部系统直接注入：
  - `start`
  - `phase`
  - `done`
  - `fail`

- [openclaw_sync_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_sync_doctor.py)
  OpenClaw 同步链诊断工具。检查：
  - backend 是否可达
  - watcher heartbeat
  - 当前观察到的 tool / activity / request

### 路由与手动任务控制

- [route_task.py](/E:/Codex%20Projects/Brotherhood-UI/route_task.py)
  纯路由层。把自然语言任务映射成状态，不直接管前端演出细节。

- [task_board.py](/E:/Codex%20Projects/Brotherhood-UI/task_board.py)
  任务生命周期脚本。适合手动驱动：
  - `start`
  - `step`
  - `done`
  - `fail`

- [set_state.py](/E:/Codex%20Projects/Brotherhood-UI/set_state.py)
  最直接的状态注入脚本。现在也会走状态总线，不再直接粗暴覆盖 `state.json`。

### 后端

- [backend/app.py](/E:/Codex%20Projects/Brotherhood-UI/backend/app.py)
  Flask 后端。职责：
  - 提供 `/status`
  - 提供 `/set_state`
  - 提供静态资源
  - 承担 join-agent / agent-push
  - 启动后台 auto-idle worker

- [backend/requirements.txt](/E:/Codex%20Projects/Brotherhood-UI/backend/requirements.txt)
  后端 Python 依赖。

- [backend/run.sh](/E:/Codex%20Projects/Brotherhood-UI/backend/run.sh)
  旧式 shell 启动辅助，不是当前主入口。

### 前端与主题同步工具

- [sync_agent_theme.py](/E:/Codex%20Projects/Brotherhood-UI/sync_agent_theme.py)
  素材同步工具。作用很大：
  - 处理 spritesheet
  - 写 `.meta.json`
  - 同步 `theme.json`
  - 支持 hero / prop / 子场景相关写入

- [launch_sync_agent_theme_gui.bat](/E:/Codex%20Projects/Brotherhood-UI/launch_sync_agent_theme_gui.bat)
  Windows 下双击启动 `sync_agent_theme.py` GUI 的快捷入口。

### 资产与交付检查链

- [generate_asset_docs.py](/E:/Codex%20Projects/Brotherhood-UI/generate_asset_docs.py)
  从资产清单生成说明文件，避免文档漂移。

- [asset_delivery_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/asset_delivery_doctor.py)
  资产投放检查器。看 placeholder、缺失素材、缺失音频等。

- [check_theme_consistency.py](/E:/Codex%20Projects/Brotherhood-UI/check_theme_consistency.py)
  主题一致性检查器。检查：
  - 场景结构
  - hero 状态链
  - spritesheet 配置
  - props 作用域
  - 音频映射

- [docs_consistency_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/docs_consistency_doctor.py)
  文档一致性检查器。防止 README、资产说明和当前实现漂移。

- [asset_acceptance_check.py](/E:/Codex%20Projects/Brotherhood-UI/asset_acceptance_check.py)
  总验收脚本。把 docs、assets、theme、frontend regression 串成一条固定验收链。

- [frontend_regression_check.js](/E:/Codex%20Projects/Brotherhood-UI/frontend_regression_check.js)
  前端行为回归测试。检查：
  - `idle -> handoff -> child scene -> idle`
  - 宋江首条随机事件
  - support hero roaming
  - roaming 中被选中
  - 随机事件被新任务打断

### 其他辅助文件

- [office-agent-push.py](/E:/Codex%20Projects/Brotherhood-UI/office-agent-push.py)
  旧的远端 agent push 兼容逻辑，偏来源项目遗留能力。

- [join-keys.json](/E:/Codex%20Projects/Brotherhood-UI/join-keys.json)
  join-agent 相关本地 key 数据。

- [AGENTS.md](/E:/Codex%20Projects/Brotherhood-UI/AGENTS.md)
  给 Agent / OpenClaw 这类系统看的仓库行为说明。

- [SKILL.md](/E:/Codex%20Projects/Brotherhood-UI/SKILL.md)
  当前仓库的技能或行为说明残留文档。

---

## 3. 前端目录现在怎么理解

### `frontend/js/` 的分工

这是当前版本最容易让人迷糊的一块。现在不要再把它理解成“一个 `app.js` 搞定所有逻辑”，而要理解成一个拆开的运行时。

- [frontend/js/app.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app.js)
  前端主入口与总编排层。它现在主要负责：
  - 初始化
  - 挂接 runtime
  - 拉 `/status`
  - 触发状态切换
  - 暴露调试对象

- [frontend/js/theme-engine.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/theme-engine.js)
  纯渲染与场景引擎核心。负责：
  - 主场景创建
  - 子场景创建
  - hero / prop 实例化
  - handoff 视觉表现
  - idle event emphasis
  - support cast roaming 的渲染接入

- [frontend/js/app-bootstrap-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-bootstrap-runtime.js)
  启动层工具。负责：
  - theme 加载
  - WebP 检测
  - 初始配置拼装
  - 一些全局 bootstrap helper

- [frontend/js/app-scene-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-scene-runtime.js)
  Phaser 场景生命周期相关辅助。

- [frontend/js/app-state-flow.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-state-flow.js)
  状态流逻辑层。负责：
  - workflow state 解析
  - `main_idle / main_handoff / child_active`
  - 最短停留时间 / 节流
  - scene phase / dialogue mode 推导

- [frontend/js/app-dialogue-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-dialogue-runtime.js)
  对白资源读取和对白池选择辅助。

- [frontend/js/app-dialogue-scheduler.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-dialogue-scheduler.js)
  对白调度器。负责：
  - idle 随机短事件
  - worker loop
  - handoff 对白相关调度

- [frontend/js/app-audio-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-audio-runtime.js)
  状态音频管理器与音频辅助逻辑。

- [frontend/js/app-status-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-status-runtime.js)
  `/status` 拉取与状态包装辅助。

- [frontend/js/app-ui-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-ui-runtime.js)
  页面 DOM UI 引用和通用 UI 辅助。

- [frontend/js/app-theme-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-theme-runtime.js)
  主题配置解析辅助。负责：
  - 资源归一化
  - props 作用域判断
  - mainScene / subscene runtime 结构构建

- [frontend/js/app-theme-roaming.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-theme-roaming.js)
  support hero 主场景 roaming 逻辑。

### `frontend/js/panels/`

这类文件属于界面面板组件层，不是当前运行时主逻辑核心。

---

## 4. 主题目录现在怎么理解

主目录：

- [frontend/themes/liangshan](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan)

### 核心配置文件

- [theme.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme.json)
  主题主骨架。负责：
  - mainScene
  - subscenes
  - hero / support hero 资源定义
  - props / objects
  - audio
  - includes

- [theme-dialogues.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme-dialogues.json)
  所有对白主数据。当前版本对白已经从 `theme.json` 中拆出来。

- [theme-main-scene-events.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme-main-scene-events.json)
  主场景 idle 随机短事件配置。

- [asset-manifest.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/asset-manifest.json)
  机器可读资产清单。主要用于：
  - placeholder 管理
  - 资产说明生成
  - 交付检查

### 目录规则

- [frontend/themes/liangshan/props/main](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/props/main)
  主场景 props。

- [frontend/themes/liangshan/subscenes](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/subscenes)
  二级子场景目录。每个子场景下有：
  - `bg.png`
  - `props/`

- [frontend/themes/liangshan/audio](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/audio)
  统一状态音频目录。现在音频命名规范已经改为：
  - `state_idle.mp3`
  - `state_researching.mp3`
  - `state_writing.mp3`
  - `state_executing.mp3`
  - `state_syncing.mp3`
  - `state_error.mp3`

### Placeholder 规则

当前项目已经强制：
- 占位素材必须是真文件
- 放在最终正确路径
- 文件名就是未来正式素材要覆盖的文件名

也就是说，你以后只做一件事：

> 用正式素材直接覆盖同名文件。

---

## 5. 现在的状态系统怎么理解

当前版本最重要的架构变化是：

> **没有任何普通业务脚本应该再直接把最终状态随手写进 `state.json`。**

现在的流程是：

1. 外部来源产生事件
2. 事件进入 `state_event_bus`
3. `state_coordinator` 做仲裁
4. 协调器生成最终 `state.json`
5. `backend/app.py` 只把快照提供给前端

### 谁是“生产者”

这些脚本可以产出事件：

- [set_state.py](/E:/Codex%20Projects/Brotherhood-UI/set_state.py)
- [task_board.py](/E:/Codex%20Projects/Brotherhood-UI/task_board.py)
- [route_task.py](/E:/Codex%20Projects/Brotherhood-UI/route_task.py)
- [openclaw_bridge.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_bridge.py)
- [openclaw_session_watch.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_session_watch.py)
- [backend/app.py](/E:/Codex%20Projects/Brotherhood-UI/backend/app.py) 的 API 写入口

### 谁是唯一仲裁者

- [state_coordinator.py](/E:/Codex%20Projects/Brotherhood-UI/state_coordinator.py)

### 为什么这一层重要

因为当前 UI 逻辑已经很复杂：
- main scene
- handoff
- child scene
- roaming
- random events
- worker loop dialogue

如果状态层没有唯一仲裁者，前端再漂亮都会被错误状态喂坏。

---

## 6. 现在的 OpenClaw 接入怎么理解

不要再把它理解成“一个 watcher 读文件就完了”。

当前逻辑是：

1. [openclaw_session_watch.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_session_watch.py)
   监看本机会话文件
2. [openclaw_activity_adapter.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_activity_adapter.py)
   优先解析显式协议提示
3. [openclaw-activity-protocol.json](/E:/Codex%20Projects/Brotherhood-UI/openclaw-activity-protocol.json)
   定义协议映射规则
4. 低置信度工具只观察，不乱改状态
5. 高置信度活动才落到状态总线

### 当前接入原则

- 显式提示优先
- 工具家族映射是兜底
- 低置信度工具尽量不直接切 UI
- `done` 不能在 pending tool 未结束时抢跑

也就是说，它已经不是“看见什么都硬猜一个状态”的旧逻辑了。

---

## 7. 当前最常用的开发动作

### 启动项目

Windows：

```powershell
.\Brotherhood-UI Launcher.bat
```

或：

```powershell
python brotherhood_control_runtime.py auto
```

macOS：

```bash
python3 brotherhood_ui_launcher.py
```

或：

```bash
python3 brotherhood_control_runtime.py auto
```

### 看系统是否正常

```powershell
python brotherhood_control_runtime.py doctor
python openclaw_sync_doctor.py
python state_bus_doctor.py
```

### 跑前端固定回归

```powershell
python brotherhood_control_runtime.py regression
```

### 做素材替换后的总验收

```powershell
python asset_acceptance_check.py
```

或：

```powershell
python brotherhood_control_runtime.py asset-check
```

### 只做素材/文档/主题检查

```powershell
python generate_asset_docs.py
python asset_delivery_doctor.py
python docs_consistency_doctor.py
python check_theme_consistency.py
```

### 手动推一个任务

```powershell
python task_board.py start "幫我查一下 OpenClaw 文件結構"
python task_board.py step writing "吳用正在整理內容"
python task_board.py done "任務完成"
```

### 手动直接切状态

```powershell
python set_state.py researching "孫二娘正在查資料"
```

### 只做自然语言路由

```powershell
python route_task.py "幫我把首頁按鈕改一下並直接落地"
```

---

## 8. 你现在应该怎么阅读这个仓库

如果你隔一段时间没看这个项目，重新熟悉的顺序建议是：

1. 先看 [README.md](/E:/Codex%20Projects/Brotherhood-UI/README.md)
   了解当前对外口径

2. 再看这份文档
   重新建立根目录文件脑图

3. 再看：
   - [brotherhood_control_runtime.py](/E:/Codex%20Projects/Brotherhood-UI/brotherhood_control_runtime.py)
   - [state_coordinator.py](/E:/Codex%20Projects/Brotherhood-UI/state_coordinator.py)
   - [openclaw_session_watch.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_session_watch.py)
   - [frontend/js/app.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app.js)
   - [frontend/js/theme-engine.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/theme-engine.js)
   - [frontend/themes/liangshan/theme.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme.json)

4. 如果你要动素材工作流，再看：
   - [sync_agent_theme.py](/E:/Codex%20Projects/Brotherhood-UI/sync_agent_theme.py)
   - [asset-manifest.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/asset-manifest.json)
   - [PLACE_ASSETS_HERE.txt](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/PLACE_ASSETS_HERE.txt)

---

## 9. 现在这个项目的真实重点

当前版本已经不是“把一个状态映射成一个人物”那么简单了。

现在你应该把 Brotherhood-UI 理解成：

> 一个以 OpenClaw 为输入、以状态总线为中枢、以前端场景系统为输出的梁山工作流演出引擎。

它现在的真正重心是：

- 状态是否稳定
- 场景是否合理切换
- 角色/对白/事件是否协调
- 素材替换是否低摩擦
- 发布前是否能快速验收

这也是为什么当前版本里：
- 总线
- doctor
- consistency
- regression
- acceptance

这些“工程化工具”已经和场景、美术、对白同样重要。

---

## 10. 按开发任务找文件

这一节是给你以后真正开发时用的。

不要先想“这个文件夹里有什么”，而是先问自己：

> 我这次到底要改什么能力？

然后按下面这张索引去找。

### 我想改启动方式 / 平台启动体验

先看：

- [brotherhood_control_runtime.py](/E:/Codex%20Projects/Brotherhood-UI/brotherhood_control_runtime.py)
- [brotherhood_ui_launcher.py](/E:/Codex%20Projects/Brotherhood-UI/brotherhood_ui_launcher.py)
- [Brotherhood-UI Launcher.bat](/E:/Codex%20Projects/Brotherhood-UI/Brotherhood-UI%20Launcher.bat)
- [brotherhood-ui.bat](/E:/Codex%20Projects/Brotherhood-UI/brotherhood-ui.bat)
- [brotherhood-ui.sh](/E:/Codex%20Projects/Brotherhood-UI/brotherhood-ui.sh)

典型场景：

- 想加一个新控制命令
- 想改 `Start / Check / Stop` 的行为
- 想统一 Windows / macOS 的入口体验

### 我想改状态写入 / 状态仲裁 / auto-idle

先看：

- [state_event_bus.py](/E:/Codex%20Projects/Brotherhood-UI/state_event_bus.py)
- [state_coordinator.py](/E:/Codex%20Projects/Brotherhood-UI/state_coordinator.py)
- [backend/app.py](/E:/Codex%20Projects/Brotherhood-UI/backend/app.py)
- [state_bus_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/state_bus_doctor.py)

典型场景：

- 想新增事件类型
- 想调整不同来源的优先级
- 想改 auto-idle 触发规则
- 想查为什么状态被覆盖

### 我想改自然语言路由

先看：

- [route_task.py](/E:/Codex%20Projects/Brotherhood-UI/route_task.py)
- [task_board.py](/E:/Codex%20Projects/Brotherhood-UI/task_board.py)
- [task-routing-rules.md](/E:/Codex%20Projects/Brotherhood-UI/docs/task-routing-rules.md)

典型场景：

- 想增加新的口语化操作覆盖
- 想减少两个规则互相抢路由
- 想让某些任务更稳定落到某个英雄/状态

### 我想改 OpenClaw 自动同步

先看：

- [openclaw_session_watch.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_session_watch.py)
- [openclaw_activity_adapter.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_activity_adapter.py)
- [openclaw-activity-protocol.json](/E:/Codex%20Projects/Brotherhood-UI/openclaw-activity-protocol.json)
- [openclaw_bridge.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_bridge.py)
- [openclaw_sync_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_sync_doctor.py)

典型场景：

- 想提高 watcher 识别精度
- 想加新的显式活动协议
- 想避免某类工具误触发状态
- 想排查本机 OpenClaw 为什么没同步进 UI

### 我想改主场景 / 子场景 / handoff 逻辑

先看：

- [frontend/js/app.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app.js)
- [frontend/js/app-state-flow.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-state-flow.js)
- [frontend/js/app-scene-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-scene-runtime.js)
- [frontend/js/theme-engine.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/theme-engine.js)
- [frontend/themes/liangshan/theme.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme.json)

典型场景：

- 想改 `idle -> handoff -> child scene -> idle`
- 想改主场景站位
- 想改子场景背景和 actor 布局
- 想改 handoff 强调效果

### 我想改对白系统 / 随机短事件

先看：

- [frontend/js/app-dialogue-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-dialogue-runtime.js)
- [frontend/js/app-dialogue-scheduler.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-dialogue-scheduler.js)
- [frontend/themes/liangshan/theme-dialogues.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme-dialogues.json)
- [frontend/themes/liangshan/theme-main-scene-events.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme-main-scene-events.json)
- [frontend/js/app.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app.js)

典型场景：

- 想补角色台词
- 想改 idle 随机短事件触发节奏
- 想改台词标签、权重、重复惩罚
- 想改气泡挂点或打断规则

### 我想改 roaming / support hero 在主场景走动

先看：

- [frontend/js/app-theme-roaming.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-theme-roaming.js)
- [frontend/js/theme-engine.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/theme-engine.js)
- [frontend/themes/liangshan/theme.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme.json)

典型场景：

- 想改 support hero 的运动范围
- 想减少重叠
- 想改 roaming 解锁时机
- 想改 handoff 时是否停下、是否保留当前位置

### 我想改音频

先看：

- [frontend/js/app-audio-runtime.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-audio-runtime.js)
- [frontend/themes/liangshan/theme.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme.json)
- [frontend/themes/liangshan/audio](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/audio)
- [frontend/themes/liangshan/audio/PLACE_AUDIO_HERE.txt](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/audio/PLACE_AUDIO_HERE.txt)

典型场景：

- 想替换状态音频
- 想调整音频映射
- 想排查 404 或自动播放问题

### 我想改素材同步工具

先看：

- [sync_agent_theme.py](/E:/Codex%20Projects/Brotherhood-UI/sync_agent_theme.py)
- [launch_sync_agent_theme_gui.bat](/E:/Codex%20Projects/Brotherhood-UI/launch_sync_agent_theme_gui.bat)
- [frontend/themes/liangshan/theme.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme.json)

典型场景：

- 想同步新的 spritesheet
- 想给 prop 自动批量生成实例
- 想把道具写进主场景或某个子场景

### 我想改资产工作流 / placeholder / 交付说明

先看：

- [asset-manifest.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/asset-manifest.json)
- [generate_asset_docs.py](/E:/Codex%20Projects/Brotherhood-UI/generate_asset_docs.py)
- [asset_delivery_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/asset_delivery_doctor.py)
- [docs_consistency_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/docs_consistency_doctor.py)
- [PLACE_ASSETS_HERE.txt](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/PLACE_ASSETS_HERE.txt)
- [asset-workflow.md](/E:/Codex%20Projects/Brotherhood-UI/docs/asset-workflow.md)

典型场景：

- 想新增 placeholder 资产位
- 想改生成说明文档
- 想让工作流更适合创作者

### 我想做发布前检查

先看：

- [check_theme_consistency.py](/E:/Codex%20Projects/Brotherhood-UI/check_theme_consistency.py)
- [frontend_regression_check.js](/E:/Codex%20Projects/Brotherhood-UI/frontend_regression_check.js)
- [asset_acceptance_check.py](/E:/Codex%20Projects/Brotherhood-UI/asset_acceptance_check.py)
- [brotherhood_control_runtime.py](/E:/Codex%20Projects/Brotherhood-UI/brotherhood_control_runtime.py)

典型动作：

```powershell
python check_theme_consistency.py
python brotherhood_control_runtime.py regression
python asset_acceptance_check.py
```

### 我想查一个 bug 到底该从哪儿下手

推荐优先顺序：

1. 如果是“状态不对”：
   - [state_bus_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/state_bus_doctor.py)
   - [openclaw_sync_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/openclaw_sync_doctor.py)

2. 如果是“场景不对 / 角色不对 / props 乱入”：
   - [theme.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme.json)
   - [theme-engine.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/theme-engine.js)

3. 如果是“对白不对 / 气泡不对 / 随机事件不对”：
   - [theme-dialogues.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme-dialogues.json)
   - [theme-main-scene-events.json](/E:/Codex%20Projects/Brotherhood-UI/frontend/themes/liangshan/theme-main-scene-events.json)
   - [app-dialogue-scheduler.js](/E:/Codex%20Projects/Brotherhood-UI/frontend/js/app-dialogue-scheduler.js)

4. 如果是“替换素材后坏了”：
   - [asset_delivery_doctor.py](/E:/Codex%20Projects/Brotherhood-UI/asset_delivery_doctor.py)
   - [check_theme_consistency.py](/E:/Codex%20Projects/Brotherhood-UI/check_theme_consistency.py)
   - [asset_acceptance_check.py](/E:/Codex%20Projects/Brotherhood-UI/asset_acceptance_check.py)
