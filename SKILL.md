---
name: brotherhood-ui
description: 把 OpenClaw 的真实任务过程同步到 Brotherhood-UI 的梁山可视化看板。收到任务先路由状态，阶段变化时更新状态，结束时回 idle 或切 error。
---

# Brotherhood-UI Skill

这不是介绍文档，这是执行规约。

你的目标只有一个：
- 主人一给任务，就让梁山看板同步显示正确的英雄和状态。

## 必须遵守的规则

### 1. 新任务开始前，必须先推送一次状态

只要主人给了一个新的自然语言任务，在真正分析、查资料、写代码、跑命令之前，先执行：

```bash
python3 task_board.py start "<主人刚刚给你的原话>"
```

例子：

```bash
python3 task_board.py start "帮我查一下 OpenClaw 的文档结构"
python3 task_board.py start "帮我改一下首页按钮颜色并直接落地"
```

含义：
- 脚本会读取 `docs/task-routing-rules.md`
- 自动匹配状态和英雄
- 直接写入 `state.json`
- 前端就会开始演出

### 2. 任务阶段变化时，必须补一次 step

如果任务已经从“查资料”变成“真正动手”，或者从“执行”变成“同步”，不要让前端一直停留在旧状态。马上执行：

```bash
python3 task_board.py step researching "正在查资料"
python3 task_board.py step writing "正在整理文字内容"
python3 task_board.py step executing "正在动手实现"
python3 task_board.py step syncing "正在同步到远端"
python3 task_board.py step error "执行受阻，正在排查"
```

判断标准：
- 查资料、看文档、分析：`researching`
- 写说明、写文案、写总结：`writing`
- 真正改代码、跑命令、落地实现：`executing`
- 上传、下载、推送、对接：`syncing`
- 报错、失败、阻塞：`error`

### 3. 任务结束时，必须收口

成功结束：

```bash
python3 task_board.py done "任务完成，梁山暂且无事"
```

失败结束：

```bash
python3 task_board.py fail "执行出错，鲁智深正在救火"
```

不要做完事还让看板卡在 `executing` 或 `researching`。

## 标准工作流

任何一次真实任务，都按这个顺序：

1. 收到任务
2. 先运行 `task_board.py start "<原始任务>"`
3. 开始真正处理任务
4. 阶段变化时运行 `task_board.py step ...`
5. 成功时运行 `task_board.py done "..."`
6. 失败时运行 `task_board.py fail "..."`

## 最小示例

### 示例 A：先查资料，再动手改

```bash
python3 task_board.py start "帮我查一下 OpenClaw 的文档结构"
python3 task_board.py step executing "武松出阵，正在动手实现"
python3 task_board.py done "任务完成，梁山暂且无事"
```

### 示例 B：直接执行，但中途失败

```bash
python3 task_board.py start "帮我改一下首页按钮颜色并直接落地"
python3 task_board.py fail "执行出错，鲁智深正在救火"
```

## 文件职责

- `task_board.py`
  - 给你用的主入口
  - 负责任务开始、阶段切换、完成、失败

- `route_task.py`
  - 只负责“自然语言任务 -> 状态/英雄”匹配
  - 一般不直接调用，除非你只想测试规则

- `docs/task-routing-rules.md`
  - 任务分配规则表
  - 主人后续会维护它

## 禁止事项

- 不要收到任务后直接开始干活，却不先运行 `task_board.py start`
- 不要任务已经完成，还把看板留在 `executing`
- 不要把“查资料”和“动手实现”长期混成一个状态
- 不要随意手改 `state.json`，除非脚本不可用

## 兜底规则

如果你一时判断不准该用哪个状态：

1. 先运行：

```bash
python3 task_board.py start "<主人原话>"
```

2. 如果后续明显进入实操，再补：

```bash
python3 task_board.py step executing "正在动手实现"
```

3. 出错就 `fail`，做完就 `done`

这是默认策略，比不更新前端强得多。
