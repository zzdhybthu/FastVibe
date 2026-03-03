# VibeCoding - Claude Code 调度中心

## Project Overview
生产级 Claude Code 调度中心，支持多仓库管理、任务队列、Docker 隔离、Git worktree 自动化和 Web UI 实时交互。

## Architecture
```
server/            # 后端 (Fastify + Claude Agent SDK + Drizzle ORM/SQLite)
web/               # 前端 (React 18 + Vite + Zustand + TailwindCSS)
shared/            # 共享类型
docker/            # Docker Worker 镜像
config.yaml        # 运行时配置
```

## Tech Stack
- **后端**: Node.js + Fastify + Claude Agent SDK + Drizzle ORM (SQLite)
- **前端**: React 18 + TypeScript + Vite + Zustand + TailwindCSS
- **通信**: WebSocket (ws) + REST API
- **容器**: Docker (dockerode)
- **构建**: pnpm workspace

## Tool Preferences
- Node.js 版本管理: fnm (不用 nvm/brew 管 node)
- 包管理器: pnpm (不用 npm)
- Python 版本/包管理: uv (不用 pip/pip3/conda)

## Workflow Rules
1. 每次有意义的变更都要 commit，commit 后自动 push
2. 同样的错误不要再犯

## Code Style
- TypeScript: strict mode, type hints
- 使用 pnpm workspace 管理 monorepo
