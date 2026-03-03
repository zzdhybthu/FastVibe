<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/banner-light.svg" />
    <img src="assets/banner-light.svg" alt="FastVibe" width="800" />
  </picture>
</p>

<p align="center">
  <a href="#技术栈"><img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js" /></a>
  <a href="#技术栈"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="#技术栈"><img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React" /></a>
  <a href="#技术栈"><img src="https://img.shields.io/badge/Claude_Code-Agent_SDK-6366f1?logo=anthropic&logoColor=white" alt="Claude Code" /></a>
  <a href="#技术栈"><img src="https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white" alt="pnpm" /></a>
</p>

<p align="center">
  一个轻量级的 Claude Code 调度中心，支持多仓库管理、任务队列、Git worktree 自动化以及 Web UI 实时交互。
</p>

<p align="center">
  在电脑上，它是清晰高效的开发看板；在手机上，它是随身携带的灵活开发工具。
</p>

## 功能特性

- **多仓库管理**: 注册多个开发仓库，独立配置和隔离
- **任务队列**: 优先级排队、并发控制、前序任务依赖
- **任务并行**: 多个原子任务同时执行，互不干扰
- **Git Worktree**: 自动创建 worktree、分支、合并、push
- **实时监控**: WebSocket 推送任务状态和日志
- **用户交互**: Claude Code 可向用户提问，用户在 Web UI 回答
- **语音输入**: Web UI 支持语音输入，适用手机场景
- **容错恢复**: 服务重启后自动恢复任务状态

## 设计理念

> 指令原子化，任务并行化，流程自动化，干预最小化，开发灵活化。

Agent 有能力根据指令完成项目的整体框架设计，但一次性满足所有愿望是不现实的——你的 prompt 不可能一次就详细覆盖所有需求。Agent 在缺乏明确指令时会自由发挥：有时偷懒，有时添油加醋，有时做错。当多个需求混在一起时，Agent 可能难以把握侧重点，出了问题也难以定位。

因此，正确的做法是：**先搭框架，再逐步修正，每次只给一个明确的指令。** 这并不低效——FastVibe 的任务并行化能力让这些原子任务同时推进，有条不紊。

## 推荐工作流

### 第一步：搭建项目框架

用 Claude Code 直接创建新项目：

1. 初始化项目目录，配置 git 和 remote
2. 想清楚你要做什么，写一份尽可能详尽的指令，并初步完成 claude 的项目配置（如系统指令、技能等）
3. 使用最好的模型 + plan mode，让 Agent 搭建项目的整体框架，实现初步功能

### 第二步：定制 Agent 工作流（可选）

- 修改 `server/src/services/prompt-builder.ts`——这里定义了 Agent 的系统指令，调整它可以直接改变 Agent 的行为模式
- Fork 本项目，用 FastVibe 来改进 FastVibe，定制化调度中心
- 如果现有架构不满足需求，也可以从零构建自己的调度系统

### 第三步：原子化迭代

将项目加入 FastVibe 的工作目录，开始提交原子化任务：

- 每条任务只做一件事：修一个 bug、加一个功能、调一处样式
- 多条任务可以并行执行，互不阻塞
- 任务之间有依赖时，用前序任务功能串联

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
    "ANTHROPIC_API_KEY": "sk-ant-...",
  },
  "skipDangerousModePermissionPrompt": true
}
```

确保 `claude --dangerously-skip-permissions` 可用。

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

## 浏览器访问

> 推荐使用 Chrome。

### 本地访问

服务启动后，直接在浏览器打开 `http://localhost:8420`。

### 远程服务器访问

如果 FastVibe 运行在远程服务器上，可通过 SSH 端口转发在本地浏览器访问：

```bash
ssh -Nfn -L 8420:localhost:8420 user@your-server-ip
```

然后在本地浏览器打开 `http://localhost:8420`。

### 手机访问

手机同样可以通过 SSH 端口转发访问。例如 [Termux](https://termux.dev)（安卓）：

1. 安装 Termux 后，在终端中执行相同的 SSH 端口转发命令
2. 根据提示开启 **wakelock**（`termux-wake-lock`），防止 Termux 在后台被系统休眠
3. 部分手机需要在 **系统设置 → 应用启动管理** 中，将 Termux 从「自动管理」改为「手动管理」，允许后台运行，防止进程被杀
4. 在手机浏览器打开 `http://localhost:8420`，可以将网页 **保存到桌面** 作为独立 APP 使用（PWA）

### 语音输入

Web UI 支持语音输入功能。首次使用时，浏览器会请求麦克风权限，请点击允许。

## 安全建议

本项目默认以 dangerous mode 运行 Claude Code，Agent 拥有完整的文件读写和命令执行权限。建议：

- 使用隔离的开发环境
- 避免以 root 权限运行
- 定期备份不受 git 管理的重要数据
