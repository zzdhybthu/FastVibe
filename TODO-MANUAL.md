# VibeCoding 手动操作清单

完成以下步骤以启用完整工具链。按顺序执行。

---

## 1. Mac 本地环境验证

```bash
cd ~/Desktop/vibe/VibeCoding
./stage-01-setup/setup-mac.sh    # 检查缺失的依赖
./stage-01-setup/verify.sh       # 验证所有工具 + CC API 连通性
```

缺失的工具按脚本提示用 `brew install` 安装。

---

## 2. 远程 Linux 服务器设置

```bash
# 安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 同步 API 代理配置
scp ~/.claude/settings.json user@linux-server:~/.claude/settings.json

# 确认 Docker 已安装且当前用户在 docker 组
docker --version
# 如果不在 docker 组:
sudo usermod -aG docker $USER
# 需重新登录生效

# 确认 tmux 已安装
tmux -V || sudo apt-get install -y tmux

# 确认 python3 已安装
python3 --version || sudo apt-get install -y python3 python3-pip
```

在 Linux 上也运行验证:
```bash
./stage-01-setup/setup-linux.sh
./stage-01-setup/verify.sh
```

---

## 3. Git 初始提交

```bash
cd ~/Desktop/vibe/VibeCoding
git add -A
git commit -m "Initial VibeCoding toolchain: 10 stages for parallel CC development"
```

worktree 功能要求 main 分支至少有一个 commit。

---

## 4. 沙箱模式选择

### 方案 A: Docker 沙箱 (Linux 服务器推荐)

```bash
cd stage-02-container
./run-in-container.sh --build   # 首次构建镜像
# 测试:
./run-in-container.sh --cmd "claude -p 'say hello' --output-format json"
```

### 方案 B: allowedTools 白名单 (Mac 本地推荐)

```bash
# 将模板复制到项目的 .claude/ 目录
mkdir -p ~/Desktop/vibe/VibeCoding/.claude
cp stage-02-container/settings-template.json .claude/settings.json
```

### 自动备份 (可选)

```bash
# 添加 cron job，每小时备份一次
crontab -e
# 添加这行:
0 * * * * ~/Desktop/vibe/VibeCoding/stage-02-container/backup.sh ~/Desktop/vibe/VibeCoding
```

---

## 5. 为目标项目生成 CLAUDE.md

```bash
cd /path/to/your-project
~/Desktop/vibe/VibeCoding/stage-05-memory/fill-templates.sh

# 或自动检测模式:
~/Desktop/vibe/VibeCoding/stage-05-memory/fill-templates.sh --auto

# 生成后 review 并定制 CLAUDE.md
```

---

## 6. 测试 Ralph Loop

```bash
# 创建测试任务
cp stage-03-ralph-loop/task-queue/sample-task.md stage-03-ralph-loop/task-queue/pending/

# 在 tmux 中运行 (Bash 版)
tmux new -s ralph
./stage-03-ralph-loop/ralph-loop.sh --once

# 或 Python 版
python3 stage-03-ralph-loop/ralph-loop.py add "创建一个 hello.py，打印 Hello World"
python3 stage-03-ralph-loop/ralph-loop.py run --once
```

---

## 7. 测试并行 Worker

```bash
# 创建几个测试任务
for i in 1 2 3 4 5; do
  echo "# Task $i\n请创建 task${i}.txt，内容为 'Task $i done'" \
    > stage-03-ralph-loop/task-queue/pending/task-${i}.md
done

# 先 dry-run 确认
./stage-04-worktree/parallel-launch.sh --workers 3 --dry-run

# 实际启动
./stage-04-worktree/parallel-launch.sh --workers 3

# 查看 worker 状态
tmux ls

# 完成后查看分支状态
./stage-04-worktree/merge-helper.sh status

# 合并结果
./stage-04-worktree/merge-helper.sh merge-all

# 清理 worktree
./stage-04-worktree/worktree-manager.sh clean
```

---

## 8. 启动 Web UI

```bash
# 安装依赖
pip3 install -r stage-06-web-ui/deploy/requirements.txt

# 启动服务器 (绑定 127.0.0.1:8420)
./stage-06-web-ui/deploy/start.sh

# 浏览器打开 http://127.0.0.1:8420
# 默认 token: vibecoding
```

### Android 远程访问

```bash
# 在 Android Termux 中建立 SSH 隧道
ssh -L 8420:localhost:8420 user@linux-server

# Chrome 打开 http://localhost:8420
# 菜单 → "添加到主屏幕" 创建 PWA
```

详细指南见 `stage-08-voice/android-shortcut.md`。

---

## 9. 语音输入 (可选)

```bash
# 安装 faster-whisper (首次下载模型约 1GB)
pip3 install faster-whisper

# 语音功能需集成到 Web UI，在 app.py 中添加:
# from stage-08-voice.voice_handler import router as voice_router
# app.include_router(voice_router)

# 浏览器需授予麦克风权限
```

---

## 10. 编排器

```bash
# 安装 PyYAML
pip3 install pyyaml

# 配置实例数量
# 编辑 stage-07-orchestrator/config.yaml 中的 max_instances

# 启动
python3 stage-07-orchestrator/orchestrator.py start -n 3

# 查看状态
python3 stage-07-orchestrator/orchestrator.py status

# 停止
python3 stage-07-orchestrator/orchestrator.py stop
```

---

## 11. Plan Mode (可选)

```bash
# Plan Mode 需集成到 Web UI，在 app.py 中添加:
# from stage-09-plan-mode.plan_manager import router as plan_router
# app.include_router(plan_router)

# 或独立运行:
python3 stage-09-plan-mode/plan_manager.py
# 访问 http://localhost:8901
```

---

## 依赖汇总

| 包 | 用途 | 安装 |
|----|------|------|
| fastapi | Web UI 后端 | `pip3 install fastapi` |
| uvicorn[standard] | ASGI 服务器 | `pip3 install uvicorn[standard]` |
| websockets | WebSocket 支持 | `pip3 install websockets` |
| aiofiles | 异步文件服务 | `pip3 install aiofiles` |
| faster-whisper | 语音转录 | `pip3 install faster-whisper` |
| pyyaml | 编排器配置 | `pip3 install pyyaml` |

一键安装全部:
```bash
pip3 install fastapi "uvicorn[standard]" websockets aiofiles faster-whisper pyyaml
```
