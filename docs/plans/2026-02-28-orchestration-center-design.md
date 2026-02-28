# VibeCoding Orchestration Center - Design Document

Date: 2026-02-28

## Overview

将 VibeCoding 改造为生产级 Claude Code 调度中心，支持多仓库管理、任务队列、Docker 隔离、Git worktree 自动化和 Web UI 实时交互。

## Architecture Decision

**方案: pnpm 工作区单体仓库, 全栈 TypeScript**

- 后端: Node.js + Fastify + Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- 前端: React 18 + TypeScript + Vite + Zustand + TailwindCSS
- 数据库: SQLite (Drizzle ORM + better-sqlite3)
- 实时通信: WebSocket (ws)
- Docker 管理: dockerode
- 构建: pnpm workspace + tsup (server) + vite (web)
- Node 管理: fnm + corepack + pnpm

## Project Structure

```
vibecoding-v2/
├── packages/
│   ├── server/                  # 后端服务
│   │   ├── src/
│   │   │   ├── index.ts         # Fastify 服务入口
│   │   │   ├── routes/
│   │   │   │   ├── tasks.ts     # 任务 CRUD
│   │   │   │   ├── repos.ts     # 仓库管理
│   │   │   │   └── config.ts    # 配置 API
│   │   │   ├── ws/
│   │   │   │   └── handler.ts   # WebSocket: 日志流、状态推送、用户确认
│   │   │   ├── services/
│   │   │   │   ├── task-queue.ts     # 任务队列 (并发控制、前序依赖)
│   │   │   │   ├── task-runner.ts    # 执行引擎 (SDK 调用)
│   │   │   │   ├── docker.ts         # Docker 容器生命周期
│   │   │   │   ├── worktree.ts       # Git worktree 辅助 (可选)
│   │   │   │   └── user-interaction.ts # 用户确认桥梁
│   │   │   ├── db/
│   │   │   │   ├── schema.ts    # Drizzle schema
│   │   │   │   └── index.ts     # 连接管理
│   │   │   └── config.ts        # 配置加载
│   │   ├── drizzle/             # 数据库迁移
│   │   └── package.json
│   ├── web/                     # React 前端
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── pages/Dashboard.tsx
│   │   │   ├── components/
│   │   │   │   ├── TaskForm.tsx       # 新建任务
│   │   │   │   ├── TaskList.tsx       # 多状态 Tab 列表
│   │   │   │   ├── TaskDetail.tsx     # 详情 + 实时日志
│   │   │   │   ├── UserConfirm.tsx    # 确认弹窗
│   │   │   │   ├── RepoSelector.tsx   # 仓库切换
│   │   │   │   └── ConfigPanel.tsx    # 配置面板
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts
│   │   │   │   └── useTasks.ts
│   │   │   └── stores/          # Zustand
│   │   └── package.json
│   └── shared/                  # 共享类型
│       ├── src/
│       │   ├── types.ts
│       │   └── constants.ts
│       └── package.json
├── docker/
│   ├── Dockerfile.worker
│   └── docker-compose.yml
├── config.example.yaml
└── pnpm-workspace.yaml
```

旧代码 (stage-01 ~ stage-10) 保留在仓库中作为参考。

## Data Model

### repos 表

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | 主键 |
| path | TEXT | 仓库绝对路径 |
| name | TEXT | 显示名 |
| mainBranch | TEXT | 主分支名 (default: main) |
| maxConcurrency | INTEGER | 该仓库最大并发 |
| gitUser | TEXT | Git commit 用户名 |
| gitEmail | TEXT | Git commit 邮箱 |
| createdAt | TEXT (ISO) | 创建时间 |

### tasks 表

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | 主键 |
| repoId | TEXT | 外键 → repos.id |
| title | TEXT (nullable) | 任务标题, 为空时截取 prompt 前 50 字符 |
| prompt | TEXT | 用户 prompt |
| status | TEXT | PENDING/QUEUED/RUNNING/AWAITING_INPUT/COMPLETED/FAILED/CANCELLED |
| thinkingEnabled | INTEGER (bool) | 是否启用思考模式 |
| predecessorTaskId | TEXT (nullable) | 前序任务 ID |
| branchName | TEXT (nullable) | CC 创建的分支名 |
| worktreePath | TEXT (nullable) | worktree 路径 |
| sessionId | TEXT (nullable) | Claude SDK session ID |
| dockerContainerId | TEXT (nullable) | Docker 容器 ID |
| result | TEXT (nullable) | 执行结果摘要 |
| errorMessage | TEXT (nullable) | 失败原因 |
| costUsd | REAL (nullable) | SDK 报告的费用 |
| startedAt | TEXT (nullable) | 开始执行时间 |
| completedAt | TEXT (nullable) | 完成时间 |
| createdAt | TEXT | 创建时间 |

### task_interactions 表

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (UUID) | 主键 |
| taskId | TEXT | 外键 → tasks.id |
| questionData | TEXT (JSON) | 问题详情 |
| answerData | TEXT (JSON, nullable) | 用户回答 |
| status | TEXT | pending/answered/timeout |
| createdAt | TEXT | 创建时间 |
| answeredAt | TEXT (nullable) | 回答时间 |

### task_logs 表

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | 自增主键 |
| taskId | TEXT | 外键 → tasks.id |
| level | TEXT | info/warn/error/debug |
| message | TEXT | 日志内容 |
| timestamp | TEXT | 时间戳 |

## Task Lifecycle

```
创建 → PENDING → QUEUED → RUNNING → COMPLETED
                   │         │
                   │         ├→ AWAITING_INPUT ──→ RUNNING (用户回答后)
                   │         │
                   │         ├→ FAILED
                   │         │
                   └─────────┴→ CANCELLED
```

- **PENDING**: 等待前序任务完成
- **QUEUED**: 前序满足, 等待并发位
- **RUNNING**: CC 正在执行
- **AWAITING_INPUT**: CC 通过 MCP 工具向用户提问, 等待回答
- **COMPLETED / FAILED / CANCELLED**: 终态

### Predecessor Task Logic

- 前序任务必须是同仓库、已终结 (COMPLETED/FAILED/CANCELLED) 且未被删除的任务
- 前序任务终结后自动检查依赖它的后续任务, 若所有前序满足则入队
- 任务启动时从前序任务列表中移除该前序

## Task Execution Engine

### Execution Flow

```
任务入队 (QUEUED)
  → 检查并发限制 (repo.maxConcurrency, global.maxTotalConcurrency)
  → 创建 Docker 容器 (绑定项目目录、~/.claude、缓存)
  → 在容器内调用 Claude Agent SDK query()
    - cwd = 项目根目录 (repo.path)
    - prompt 指示 CC 自行创建 worktree + branch
  → 流式处理 SDKMessage
    → assistant 消息 → 推送日志到 WebSocket
    → tool_use (ask_user MCP) → 转为 AWAITING_INPUT, 等待用户回答
    → result (success) → 标记 COMPLETED
    → result (error) → 标记 FAILED
  → 清理: 删除 Docker 容器
```

### Claude Agent SDK Integration

```typescript
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

const conversation = query({
  prompt: buildPrompt(task),
  options: {
    cwd: repo.path,                           // 项目根目录
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: ['user', 'project'],
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    tools: { type: 'preset', preset: 'claude_code' },
    thinking: task.thinkingEnabled
      ? { type: 'enabled', budgetTokens: 10000 }
      : { type: 'adaptive' },
    abortController,
    mcpServers: { 'user-interaction': userInteractionMcpServer },
    spawnClaudeCodeProcess: (opts) => spawnInDocker(opts, containerId),
  },
});

for await (const message of conversation) {
  handleMessage(message, task);
}
```

### User Interaction MCP Tool

```typescript
const userInteractionServer = createSdkMcpServer({
  name: 'user-interaction',
  tools: [
    tool('ask_user', '向用户提问并等待回答', {
      question: z.string(),
      options: z.array(z.string()).optional(),
    }, async (args) => {
      // 1. 在 task_interactions 表创建记录
      // 2. 更新任务状态为 AWAITING_INPUT
      // 3. 通过 WebSocket 推送到前端
      // 4. await waitForUserAnswer(taskId, interactionId) — Promise + EventEmitter
      // 5. 更新任务状态回 RUNNING
      // 6. 返回用户答案
      return { content: [{ type: 'text', text: answer }] };
    }),
  ],
});
```

### CC Prompt Template

CC 在容器内执行时收到的 prompt 包含以下指令:

```
你的任务: {task.prompt}

执行步骤:
1. 基于 {mainBranch} 创建新 worktree: git worktree add .claude-worktrees/{branchName} -b {branchName}
2. cd 进入新 worktree 路径
3. 根据上述任务描述完成开发工作
4. 如需用户确认, 使用 ask_user MCP 工具
5. 完成后, 如果有 lint/format 工具可用, 执行检查并修复问题
6. git add + git commit, commit message 格式: xxx(yyy): zzz
7. 切回项目根目录, 合并分支到 {mainBranch}; 如有冲突需理解双方意图并解决, 重复步骤 5-7
8. 删除 worktree 和分支: git worktree remove .claude-worktrees/{branchName} && git branch -d {branchName}
9. push 到 github: git push
10. 遇到重要问题或完成重要改动, 记录在 PROGRESS.md (带 commit id)
11. 无法解决的问题, 标记失败并给出原因

Git 配置:
- user.name: {gitUser}
- user.email: {gitEmail}
```

## Docker Integration

### Worker Container

```dockerfile
FROM node:22-slim
RUN npm install -g @anthropic-ai/claude-code
# + git, python3, uv, etc.
```

### Container Lifecycle

```typescript
const container = await docker.createContainer({
  Image: config.docker.image,
  Cmd: ['sleep', 'infinity'],
  HostConfig: {
    Binds: [
      `${repo.path}:/workspace`,
      `${HOME}/.claude:/root/.claude:ro`,
      ...config.docker.binds,
    ],
    NetworkMode: config.docker.networkMode || 'host',
  },
  Labels: { 'vibecoding.task-id': task.id },
  WorkingDir: '/workspace',
});
await container.start();
// ... 任务执行 ...
await container.stop();
// AutoRemove 或手动 remove
```

### spawnClaudeCodeProcess

```typescript
function spawnInDocker(opts, containerId): SpawnedProcess {
  const proc = child_process.spawn('docker', [
    'exec', '-i', containerId,
    'env', '-u', 'CLAUDECODE',
    ...opts.command,
  ]);
  return {
    stdin: proc.stdin,
    stdout: proc.stdout,
    stderr: proc.stderr,
    pid: proc.pid,
    kill: (signal) => proc.kill(signal),
    on: (event, handler) => proc.on(event, handler),
  };
}
```

## REST API

### Auth

所有接口需 Bearer Token: `Authorization: Bearer {token}`

### Repos

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/repos | 列出所有仓库 |
| POST | /api/repos | 注册仓库 |
| PUT | /api/repos/:id | 更新仓库配置 |
| DELETE | /api/repos/:id | 删除仓库 |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/repos/:repoId/tasks | 按状态过滤任务列表 |
| POST | /api/repos/:repoId/tasks | 创建任务 (prompt, title?, thinkingEnabled, predecessorTaskId?) |
| GET | /api/tasks/:id | 任务详情 (含日志、交互记录) |
| POST | /api/tasks/:id/cancel | 取消任务 |
| DELETE | /api/tasks/:id | 删除终态任务 |
| DELETE | /api/repos/:repoId/tasks/bulk | 批量删除终态任务 (query: status) |

### Interactions

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/interactions/:id/answer | 回答用户确认 |

### Config

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/config | 获取配置 |
| PUT | /api/config | 更新配置 |

## WebSocket Protocol

连接: `ws://host:port/ws?token=xxx`

### Server → Client

```typescript
{ type: 'task:status', taskId, repoId, status, ... }
{ type: 'task:log', taskId, level, message, timestamp }
{ type: 'task:interaction', taskId, interactionId, questionData }
{ type: 'ping' }
```

### Client → Server

```typescript
{ type: 'subscribe', repoId }
{ type: 'interaction:answer', interactionId, answer }
```

## Frontend UI

### Layout

```
┌──────────────────────────────────────────┐
│ VibeCoding 调度中心    [仓库选择 ▼]  [配置] │
├──────────────────────────────────────────┤
│ [+ 新任务]                               │
│ Tab: 待运行 | 运行中 | 待确认 |            │
│      已完成 | 失败 | 已取消                │
│ ┌────────────────────────────────────────┐│
│ │  任务卡片列表                            ││
│ │  - 显示标题 (或 prompt 摘要)、状态、时间   ││
│ │  - 操作: 取消 / 删除 / 查看详情          ││
│ └────────────────────────────────────────┘│
│ [清空已完成] [清空失败] [清空已取消]         │
└──────────────────────────────────────────┘
```

### Task Form

- Prompt (必填, 多行文本)
- 标题 (可选, 为空时自动截取 prompt 前 50 字符)
- 思考模式 (开关)
- 前序任务 (下拉多选, 仅显示同仓库终态未删除任务)

### Task Detail

- 基本信息 + 实时日志流 + 用户确认区 + 错误信息 + Git 信息

## Fault Tolerance

### Service Restart Recovery

1. 扫描 RUNNING / AWAITING_INPUT 状态任务
2. 检查对应 Docker 容器是否存在
3. 容器存在 → 尝试重连 (resume session)
4. 容器不存在 → 标记 FAILED ("调度中断")
5. 重新调度 QUEUED 任务

### Error Handling

- SDK error_max_turns → FAILED
- SDK error_during_execution → FAILED
- Container crash/OOM → FAILED
- API rate limit → SDK 内置重试
- 用户确认超时 (configurable, default 30min) → FAILED

### Orphan Cleanup

- 服务启动时清理带 `vibecoding.task-id` label 的孤儿容器

## Configuration

```yaml
server:
  port: 8420
  host: '0.0.0.0'
  authToken: 'your-secret-token'

global:
  maxTotalConcurrency: 5

repos:
  - path: '/home/user/my-project'
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
    - '~/.local/share/fnm:/root/.local/share/fnm'
  networkMode: 'host'

claude:
  model: 'claude-sonnet-4-6'
  maxBudgetUsd: 5.0
  interactionTimeout: 1800
```
