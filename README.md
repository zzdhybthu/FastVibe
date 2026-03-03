# VibeCoding - Claude Code 调度中心

生产级 Claude Code 调度中心，支持多仓库管理、任务队列、Git worktree 自动化和 Web UI 实时交互。

## 功能特性

- **多仓库管理**: 注册多个开发仓库，独立配置和隔离
- **任务队列**: 优先级排队、并发控制、前序任务依赖
- **Git Worktree**: Claude Code 自动创建 worktree、分支、合并、push
- **实时监控**: WebSocket 推送任务状态和日志
- **用户交互**: Claude Code 可向用户提问，用户在 Web UI 回答
- **容错恢复**: 服务重启后自动恢复任务状态

## 项目结构

```
server/            # 后端 (Fastify + Claude Agent SDK + Drizzle ORM/SQLite)
web/               # 前端 (React 18 + Vite + Zustand + TailwindCSS)
shared/            # 共享类型
docker/            # Docker Worker 镜像
config.yaml        # 运行时配置
```

## 技术栈

- **后端**: Node.js (>=22) + Fastify + Claude Agent SDK + Drizzle ORM (SQLite)
- **前端**: React 18 + TypeScript + Vite + Zustand + TailwindCSS
- **通信**: WebSocket (ws) + REST API
- **构建**: pnpm workspace monorepo

## 前置要求

- Node.js >= 22 (推荐通过 fnm 安装)
- pnpm (通过 corepack 启用)
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

## 快速开始

```bash
pnpm install        # 安装依赖
```

编辑 `config.yaml`，设置 `server.authToken` 等参数。仓库通过 Web UI 管理。

### 开发模式

前后端分离，支持热重载：

```bash
pnpm dev            # 启动后端 (tsx watch, :8420)
pnpm dev:web        # 启动前端 (Vite dev server, :5173)
```

前端 Vite 自动将 `/api/*` 和 `/ws` 代理到后端 `:8420`，无需手动处理跨域。两个服务需分别启动。

### 生产模式

单端口部署，后端同时托管前端静态文件：

```bash
pnpm build          # 构建所有包 (shared + server + web)
pnpm start          # 启动生产服务 (:8420)
```

构建后后端自动检测 `web/dist/` 并挂载为静态资源，访问 `:8420` 即同时提供 API 和前端界面。

### 其他命令

```bash
pnpm -r typecheck   # TypeScript 类型检查
pnpm test           # 运行测试
pnpm clean          # 清理构建产物 (dist/)
pnpm clean:db       # 清空数据库 (server/data/)
pnpm clean:all      # 清理构建产物 + 依赖 (dist/ + node_modules/)
```

## 配置说明

```yaml
server:
  port: 8420              # 服务端口
  host: '0.0.0.0'         # 监听地址
  authToken: 'xxx'        # Bearer Token

global:
  maxTotalConcurrency: 5  # 总并发上限

claude:
  model:                  # 可用模型列表
    - 'claude-opus-4-6'
    - 'claude-sonnet-4-6'
  maxBudgetUsd: 1000.0    # 预算上限
  interactionTimeout: 86400  # 用户确认超时(秒)
```

也可通过环境变量 `CONFIG_PATH` 指定配置文件路径。
