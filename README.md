# FastVibe - Claude Code 调度中心

轻量级 Claude Code 调度中心，支持多仓库管理、任务队列、Git worktree 自动化和 Web UI 实时交互。

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
config.yaml        # 运行时配置
```

## 技术栈

- **后端**: Node.js (>=22) + Fastify + Claude Agent SDK + Drizzle ORM (SQLite)
- **前端**: React 18 + TypeScript + Vite + Zustand + TailwindCSS
- **通信**: WebSocket (ws) + REST API
- **构建**: pnpm workspace monorepo

## 前置要求

### 1. 安装 Node.js (>= 22)

推荐使用 [fnm](https://github.com/Schniz/fnm) 管理 Node.js 版本：

```bash
# 安装 fnm
curl -fsSL https://fnm.vercel.app/install | bash

# 重新加载 shell 配置（或重开终端）
source ~/.bashrc  # 或 source ~/.zshrc

# 安装并使用 Node.js 22
fnm install 22
fnm use 22

# 验证
node -v  # 应输出 v22.x.x
```

### 2. 启用 pnpm

Node.js 22 内置 corepack，直接启用即可：

```bash
corepack enable
corepack prepare pnpm@latest --activate

# 验证
pnpm -v
```

### 3. 安装并配置 Claude Code CLI

```bash
# 安装
curl -fsSL https://claude.ai/install.sh | bash

# 验证安装
claude --version
```

登录或配置用户级 settings（`~/.claude/settings.json`）：

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

确保 `claude code` 可用。

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
