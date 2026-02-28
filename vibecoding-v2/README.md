# VibeCoding v2 - Claude Code 调度中心

生产级 Claude Code 调度中心，支持多仓库管理、任务队列、Docker 隔离、Git worktree 自动化和 Web UI 实时交互。

## 功能特性

- **多仓库管理**: 注册多个开发仓库，独立配置和隔离
- **任务队列**: 优先级排队、并发控制、前序任务依赖
- **Docker 隔离**: 每个任务在独立容器中运行
- **Git Worktree**: CC 自动创建 worktree、分支、合并、push
- **实时监控**: WebSocket 推送任务状态和日志
- **用户交互**: CC 可向用户提问，用户在 Web UI 回答
- **容错恢复**: 服务重启后自动恢复任务状态

## 技术栈

- **后端**: Node.js + Fastify + Claude Agent SDK + Drizzle ORM (SQLite)
- **前端**: React 18 + TypeScript + Vite + Zustand + TailwindCSS
- **通信**: WebSocket (ws) + REST API
- **容器**: Docker (dockerode)
- **构建**: pnpm workspace

## 前置要求

- Node.js >= 22 (推荐通过 fnm 安装)
- pnpm (通过 corepack 启用)
- Docker
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

## 快速开始

### 1. 安装依赖

```bash
cd vibecoding-v2
pnpm install
```

### 2. 配置

```bash
cp config.example.yaml config.yaml
# 编辑 config.yaml:
# - 设置 server.authToken
# - 添加仓库到 repos 列表
# - 配置 docker.binds (根据实际环境)
# - 设置 claude.model 和预算
```

### 3. 构建 Docker Worker 镜像

```bash
cd docker
docker compose build
```

### 4. 构建前端

```bash
pnpm --filter @vibecoding/web build
```

### 5. 启动服务

```bash
pnpm --filter @vibecoding/server dev
```

访问 http://localhost:8420 打开 Web UI。

### 6. 验证

```bash
./scripts/smoke-test.sh
```

## 配置说明

```yaml
server:
  port: 8420           # 服务端口
  host: '0.0.0.0'      # 监听地址
  authToken: 'xxx'     # Bearer Token

global:
  maxTotalConcurrency: 5  # 总并发上限

repos:
  - path: '/path/to/repo'
    name: 'my-project'
    mainBranch: 'main'
    maxConcurrency: 3
    git:
      user: 'username'
      email: 'user@example.com'

docker:
  image: 'vibecoding-worker:latest'
  binds:
    - '~/.claude:/root/.claude:ro'
    - '~/.cache/uv:/root/.cache/uv'
  networkMode: 'host'

claude:
  model: 'claude-sonnet-4-6'
  maxBudgetUsd: 5.0
  interactionTimeout: 1800  # 用户确认超时(秒)
```

## 开发

```bash
# 启动后端 (带 hot reload)
pnpm --filter @vibecoding/server dev

# 启动前端 (Vite dev server, 代理到后端)
pnpm --filter @vibecoding/web dev

# TypeScript 类型检查
pnpm -r typecheck

# 构建所有
pnpm build
```

## 项目结构

```
vibecoding-v2/
├── packages/
│   ├── server/        # 后端 (Fastify + Claude SDK)
│   ├── web/           # 前端 (React + Vite)
│   └── shared/        # 共享类型
├── docker/            # Docker Worker 镜像
├── scripts/           # 工具脚本
└── config.example.yaml
```
