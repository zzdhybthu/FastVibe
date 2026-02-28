# VibeCoding - Agentic Coding Throughput Toolkit

## Project Overview
VibeCoding 是一套提高 Claude Code (CC) 并行化开发效率的工具链，基于胡渊鸣的文章《我给 10 个 Claude Code 打工》构建。

## Architecture
```
shared/           - 跨阶段共享工具 (cc_wrapper, platform_detect, logging)
stage-01-setup/   - 环境检查与安装
stage-02-container/ - 安全沙箱 (Docker + allowedTools)
stage-03-ralph-loop/ - 任务队列循环 (Ralph Loop)
stage-04-worktree/  - Git worktree 并行化
stage-05-memory/    - CLAUDE.md + PROGRESS.md 模板系统
stage-06-web-ui/    - 手机端 Web 管理器 (FastAPI + PWA)
stage-07-orchestrator/ - CC 编排管理器 (asyncio)
stage-08-voice/     - 语音输入 (本地 Whisper)
stage-09-plan-mode/ - Plan Mode 集成
stage-10-practices/ - 管理实践文档
```

## Key Technical Details
- CC 通过 `CLAUDECODE` 环境变量阻止嵌套，子进程调用必须 `env -u CLAUDECODE`
- API 代理: `api9.xhub.chat` (已配置于 `~/.claude/settings.json`)
- 平台: Mac (Apple M1 Pro, macOS 12.7.6) + Linux 远程服务器

## Tool Preferences
- Node.js 版本管理: fnm (不用 nvm/brew 管 node)
- 包管理器: pnpm (不用 npm)
- Python 版本/包管理: uv (不用 pip/pip3/conda)
- 全局 CLI 工具 (claude 等): 通过 brew 安装 (不用 npm -g / pnpm -g)

## Workflow Rules
1. 开始工作前必须读 PROGRESS.md
2. 完成任务后更新 PROGRESS.md
3. 每次有意义的变更都要 commit
4. 同样的错误不要再犯
5. 使用 `shared/cc_wrapper.sh` 调用 CC，不要直接调用

## Code Style
- Shell: bash, 使用 `set -euo pipefail`
- Python: 3.9+, type hints, asyncio for async code, uv 管理依赖
- 日志统一使用 `shared/logging.py`
