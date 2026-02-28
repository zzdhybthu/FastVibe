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
# 安装 fnm (Fast Node Manager)
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc  # 或重启 shell
fnm install --lts && fnm default lts-latest

# 安装 pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -

# 安装 Claude Code CLI (推荐 brew，或 npm 后备)
brew install claude-code
# 后备: npm install -g @anthropic-ai/claude-code

# 同步配置到服务器
# 注意: settings.json 含 API key 明文，多人共用服务器建议分离敏感信息
scp ~/.claude/settings.json user@linux-server:~/.claude/settings.json

# 关于插件:
# - @claude-plugins-official 官方插件会在 CC 启动时自动下载，无需手动安装
# - Playwright 插件需要额外安装浏览器 (如果服务器上要用):
#   npx playwright install chromium
#
# 安全建议: 服务器上可以只保留非敏感配置，API key 用环境变量注入:
#   export ANTHROPIC_API_KEY="sk-xxx"
#   export ANTHROPIC_BASE_URL="https://api9.xhub.chat"
# 然后从服务器的 settings.json 中删除 env 段

# 确认 Docker 已安装且当前用户在 docker 组
docker --version
# 如果不在 docker 组:
sudo usermod -aG docker $USER
# 需重新登录生效

# 确认 tmux 已安装
tmux -V || sudo apt-get install -y tmux

# 确认 uv 已安装 (Python 版本/包管理)
uv --version || curl -LsSf https://astral.sh/uv/install.sh | sh
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

### WIP 自动快照 (可选)

```bash
# 添加 cron job，每 15 分钟自动保存未提交修改到 git stash
crontab -e
# 添加这行:
*/15 * * * * ~/Desktop/vibe/VibeCoding/stage-02-container/backup.sh ~/Desktop/vibe/VibeCoding
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
uv run python stage-03-ralph-loop/ralph-loop.py add "创建一个 hello.py，打印 Hello World"
uv run python stage-03-ralph-loop/ralph-loop.py run --once
```

---

## 7. 测试并行 Worker (一任务一 Worktree)

每个任务在独立的 git worktree 中运行，互不干扰。
`--workers N` 控制最大并行数，超出的任务留在队列等下次启动。

### 7.1 准备测试任务

```bash
# 创建几个测试任务 (支持 .md / .txt / .task 格式)
for i in 1 2 3 4 5; do
  echo "请创建 task${i}.txt，内容为 'Task $i done'" \
    > stage-03-ralph-loop/task-queue/pending/task-${i}.md
done
```

### 7.2 Dry-run 预览

```bash
# 确认每个任务对应独立的 worktree 和分支
./stage-04-worktree/parallel-launch.sh --dry-run --workers 3

# 预期输出:
#   任务 1:
#     文件: task-1.md
#     将创建 worktree: task-1 (分支: worker-task-1)
#     将启动 tmux session: vibe-task-task-1
#   任务 2: ...
#   任务 3: ...
#   剩余 2 个任务等待下次启动
```

验证要点:
- 每个任务有独立的 worktree 名和分支名（以任务文件名命名）
- `--workers 3` 时只启动前 3 个，剩余 2 个显示"等待下次启动"
- tmux session 名为 `vibe-task-<任务名>`

### 7.3 实际启动

```bash
./stage-04-worktree/parallel-launch.sh --workers 3
```

验证要点:
- `tmux ls` 应显示 3 个 `vibe-task-*` session
- `./stage-04-worktree/worktree-manager.sh list` 应显示 3 个独立 worktree
- 每个 worktree 目录在 `.claude-worktrees/<任务名>/`

### 7.4 任务完成后

```bash
# 连接到某个任务查看进度
tmux attach -t vibe-task-task-1

# 查看所有任务分支状态
./stage-04-worktree/merge-helper.sh status

# 预期: 每个任务一个 worker-<任务名> 分支，各有独立的 commit
```

### 7.5 合并与清理

```bash
# 逐个或批量合并
./stage-04-worktree/merge-helper.sh merge-all

# 清理所有 worktree
./stage-04-worktree/worktree-manager.sh clean
```

### 7.6 处理剩余任务

```bash
# 前 3 个任务完成后，再次运行启动剩余任务
./stage-04-worktree/parallel-launch.sh --workers 3
# 此时队列中剩余 2 个任务会各自获得新的 worktree
```

### 7.7 特殊情况测试

```bash
# 任务名含特殊字符 → 自动消毒
echo "test" > stage-03-ralph-loop/task-queue/pending/"My Task (v2).md"
./stage-04-worktree/parallel-launch.sh --dry-run
# 预期 worktree 名: my-task-v2

# 停止所有运行中的任务
./stage-04-worktree/parallel-launch.sh stop
```

---

## 8. 启动 Web UI

```bash
# 安装依赖
uv pip install -r stage-06-web-ui/deploy/requirements.txt

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
uv pip install faster-whisper

# 语音功能需集成到 Web UI，在 app.py 中添加:
# from stage-08-voice.voice_handler import router as voice_router
# app.include_router(voice_router)

# 浏览器需授予麦克风权限
```

---

## 10. 编排器

```bash
# 安装 PyYAML
uv pip install pyyaml

# 配置实例数量
# 编辑 stage-07-orchestrator/config.yaml 中的 max_instances

# 启动
uv run python stage-07-orchestrator/orchestrator.py start -n 3

# 查看状态
uv run python stage-07-orchestrator/orchestrator.py status

# 停止
uv run python stage-07-orchestrator/orchestrator.py stop
```

---

## 11. Plan Mode (可选)

```bash
# Plan Mode 需集成到 Web UI，在 app.py 中添加:
# from stage-09-plan-mode.plan_manager import router as plan_router
# app.include_router(plan_router)

# 或独立运行:
uv run python stage-09-plan-mode/plan_manager.py
# 访问 http://localhost:8901
```

---

## 依赖汇总

| 包 | 用途 | 安装 |
|----|------|------|
| fastapi | Web UI 后端 | `uv pip install fastapi` |
| uvicorn[standard] | ASGI 服务器 | `uv pip install uvicorn[standard]` |
| websockets | WebSocket 支持 | `uv pip install websockets` |
| aiofiles | 异步文件服务 | `uv pip install aiofiles` |
| faster-whisper | 语音转录 | `uv pip install faster-whisper` |
| pyyaml | 编排器配置 | `uv pip install pyyaml` |

一键安装全部:
```bash
uv pip install fastapi "uvicorn[standard]" websockets aiofiles faster-whisper pyyaml
```
