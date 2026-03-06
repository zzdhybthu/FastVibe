# Codex Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support OpenAI Codex as an alternative code agent alongside Claude Code, with per-task agent selection and global default config.

**Architecture:** Add `AgentType` union type, `agentType` field to tasks, abstract runner interface with separate Claude/Codex implementations, and frontend agent selector that dynamically switches model lists.

**Tech Stack:** `@openai/codex-sdk` for Codex integration, existing Drizzle ORM migration for schema, Zustand store for frontend state.

---

### Task 1: Shared types and config schema

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/src/config.ts`
- Modify: `config.example.yaml`

**Step 1: Add AgentType and update shared types**

In `shared/src/types.ts`, add the `AgentType` union after line 12:

```typescript
export type AgentType = 'claude-code' | 'codex';
```

Add `agentType: AgentType;` to the `Task` interface after line 30 (after `status`).

Add `agentType?: AgentType;` to `CreateTaskRequest` after line 76.

Replace `ClaudeDefaults` interface (lines 121-126) with:

```typescript
export interface AgentDefaults {
  defaultAgent: AgentType;
  claude: {
    models: string[];
    defaultModel: string;
    maxBudgetUsd: number;
    interactionTimeout: number;
  };
  codex: {
    models: string[];
    defaultModel: string;
  };
}
```

Update `AppConfig` (lines 105-119) to add `defaultAgent` and `codex`:

```typescript
export interface AppConfig {
  server: {
    port: number;
    host: string;
    authToken: string;
  };
  global: {
    maxTotalConcurrency: number;
  };
  defaultAgent: AgentType;
  claude: {
    model: string[];
    maxBudgetUsd: number;
    interactionTimeout: number;
  };
  codex: {
    model: string[];
  };
}
```

**Step 2: Update config schema**

In `server/src/config.ts`, add `defaultAgent` and `codex` to the Zod schema:

```typescript
const configSchema = z.object({
  server: z.object({
    port: z.number().default(8420),
    host: z.string().default('0.0.0.0'),
    authToken: z.string(),
  }),
  global: z.object({
    maxTotalConcurrency: z.number().default(5),
  }),
  defaultAgent: z.enum(['claude-code', 'codex']).default('claude-code'),
  claude: z.object({
    model: z.array(z.string()).min(1).default(['claude-sonnet-4-6']),
    maxBudgetUsd: z.number().default(5.0),
    interactionTimeout: z.number().default(1800),
  }),
  codex: z.object({
    model: z.array(z.string()).min(1).default(['o3']),
  }).default({ model: ['o3'] }),
});
```

**Step 3: Update config.example.yaml**

```yaml
server:
  port: 8420
  host: '0.0.0.0'
  authToken: 'change-me-to-a-secret-token'

global:
  maxTotalConcurrency: 5

defaultAgent: 'claude-code'

claude:
  model:
    - 'claude-opus-4-6'
    - 'claude-sonnet-4-6'
    - 'claude-haiku-4-5-20251001'
  maxBudgetUsd: 1000.0
  interactionTimeout: 81728000

codex:
  model:
    - 'o3'
```

**Step 4: Run typecheck**

Run: `pnpm --filter @fastvibe/shared run typecheck && pnpm --filter @fastvibe/server run typecheck`
Expected: Type errors in files that reference `ClaudeDefaults` — these will be fixed in subsequent tasks.

**Step 5: Commit**

```bash
git add shared/src/types.ts server/src/config.ts config.example.yaml
git commit -m "feat: add AgentType and codex config to shared types"
```

---

### Task 2: Database migration

**Files:**
- Modify: `server/src/db/schema.ts`
- Create: new migration file via drizzle-kit

**Step 1: Add agentType column to schema**

In `server/src/db/schema.ts`, add after line 17 (after `status`):

```typescript
  agentType: text('agent_type').notNull().default('claude-code'),
```

**Step 2: Generate migration**

Run: `cd server && pnpm drizzle-kit generate`
Expected: New migration file created in `server/drizzle/`

**Step 3: Commit**

```bash
git add server/src/db/schema.ts server/drizzle/
git commit -m "feat: add agent_type column to tasks table"
```

---

### Task 3: Backend config route and task route updates

**Files:**
- Modify: `server/src/routes/config.ts`
- Modify: `server/src/routes/tasks.ts`

**Step 1: Update config route**

Replace `server/src/routes/config.ts` entirely:

```typescript
import type { FastifyInstance } from 'fastify';
import type { AppConfig, AgentDefaults } from '@fastvibe/shared';

export async function configRoutes(app: FastifyInstance, config: AppConfig) {
  app.get('/api/config/agent-defaults', async (_request, reply) => {
    const defaults: AgentDefaults = {
      defaultAgent: config.defaultAgent,
      claude: {
        models: config.claude.model,
        defaultModel: config.claude.model[0],
        maxBudgetUsd: config.claude.maxBudgetUsd,
        interactionTimeout: config.claude.interactionTimeout,
      },
      codex: {
        models: config.codex.model,
        defaultModel: config.codex.model[0],
      },
    };
    return reply.send(defaults);
  });
}
```

**Step 2: Update task creation route**

In `server/src/routes/tasks.ts`:

Add `agentType` to `createTaskSchema` (after line 56):
```typescript
  agentType: z.enum(['claude-code', 'codex']).default('claude-code'),
```

Add `agentType` to `restartTaskSchema` (after line 66):
```typescript
  agentType: z.enum(['claude-code', 'codex']).optional(),
```

In the `newTask` object (around line 117), add after `status`:
```typescript
        agentType: body.agentType ?? config.defaultAgent,
```

When defaulting `model` (line 125), make it agent-aware:
```typescript
        model: body.model ?? (
          (body.agentType ?? config.defaultAgent) === 'codex'
            ? config.codex.model[0]
            : config.claude.model[0]
        ),
```

In the restart route's `newTask` (around line 260), add after `status`:
```typescript
        agentType: (overrides as any).agentType ?? task.agentType ?? 'claude-code',
```

And for model in restart:
```typescript
        model: overrides.model ?? task.model,
```

**Step 3: Commit**

```bash
git add server/src/routes/config.ts server/src/routes/tasks.ts
git commit -m "feat: update config and task routes for agent type support"
```

---

### Task 4: Runner abstraction and Claude runner extraction

**Files:**
- Create: `server/src/services/runners/types.ts`
- Create: `server/src/services/runners/claude-runner.ts`
- Modify: `server/src/services/task-runner.ts`

**Step 1: Create runner types**

Create `server/src/services/runners/types.ts`:

```typescript
import type { Task, Repo, LogLevel, TaskStatus, WsServerEvent } from '@fastvibe/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/index.js';
import { eventBus } from '../../ws/event-bus.js';

/**
 * Context passed to each agent runner.
 */
export interface RunContext {
  task: Task;
  repo: Repo;
  abortController: AbortController;
  logTask: (level: LogLevel, message: string) => Promise<void>;
  broadcastStatus: (status: TaskStatus) => Promise<void>;
}

/**
 * Interface all agent runners must implement.
 */
export interface AgentRunner {
  run(ctx: RunContext): Promise<{ result?: string; costUsd?: number }>;
}

/**
 * Helper: log a task message to DB and broadcast via eventBus.
 */
export async function logTask(taskId: string, level: LogLevel, message: string): Promise<void> {
  const db = getDb();
  const timestamp = new Date().toISOString();

  await db.insert(schema.taskLogs).values({ taskId, level, message, timestamp });

  const event: WsServerEvent = {
    type: 'task:log',
    taskId,
    level,
    message,
    timestamp,
  };
  eventBus.emit('ws:broadcast', event);
}

/**
 * Helper: broadcast a task status change.
 */
export async function broadcastTaskStatus(taskId: string, repoId: string, status: TaskStatus): Promise<void> {
  const db = getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return;

  const event: WsServerEvent = {
    type: 'task:status',
    taskId,
    repoId,
    status,
    task: task as Task,
  };
  eventBus.emit('ws:broadcast', event);
}
```

**Step 2: Create Claude runner**

Create `server/src/services/runners/claude-runner.ts`:

Extract the Claude SDK call logic from current `task-runner.ts` (lines 89-142 and 193-266) into this file. The runner should:

- Import `query as sdkQuery` and `SDKMessage` from `@anthropic-ai/claude-agent-sdk`
- Import `createUserInteractionServer` from `../user-interaction.js`
- Import `buildPrompt`, `getSystemPromptAppend` from `../prompt-builder.js`
- Import `loadExternalMcpServers` from `../mcp-loader.js`
- Implement `AgentRunner.run()` that:
  1. Creates user interaction MCP server
  2. Builds prompt via `buildPrompt()`
  3. Builds clean env (delete CLAUDECODE)
  4. Loads external MCP servers
  5. Calls `sdkQuery()` with all current options
  6. Streams messages, logging via `ctx.logTask()`
  7. Returns `{ result, costUsd }` from the result message

```typescript
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createUserInteractionServer } from '../user-interaction.js';
import { buildPrompt, getSystemPromptAppend } from '../prompt-builder.js';
import { loadExternalMcpServers } from '../mcp-loader.js';
import type { AgentRunner, RunContext } from './types.js';

export const claudeRunner: AgentRunner = {
  async run(ctx: RunContext): Promise<{ result?: string; costUsd?: number }> {
    const { task, repo, abortController } = ctx;
    const taskLanguage = (task.language ?? 'zh') as 'zh' | 'en';

    // Create user interaction MCP server
    const mcpServer = createUserInteractionServer(
      task.id, repo.id, task.interactionTimeout, taskLanguage, abortController.signal,
    );

    // Build prompt
    const prompt = buildPrompt(task, repo);

    // Build env without CLAUDECODE
    const cleanEnv: Record<string, string | undefined> = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    // Load external MCP servers
    const externalMcpServers = loadExternalMcpServers(repo.path);
    const externalNames = Object.keys(externalMcpServers);
    if (externalNames.length > 0) {
      await ctx.logTask('info', `Loaded external MCP servers: ${externalNames.join(', ')}`);
    }

    const conversation = sdkQuery({
      prompt,
      options: {
        cwd: repo.path,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['user', 'project'],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: getSystemPromptAppend(taskLanguage),
        },
        tools: { type: 'preset', preset: 'claude_code' },
        thinking: task.thinkingEnabled
          ? { type: 'enabled', budgetTokens: 10000 }
          : { type: 'adaptive' },
        model: task.model,
        maxBudgetUsd: task.maxBudgetUsd,
        abortController,
        env: cleanEnv,
        mcpServers: {
          ...externalMcpServers,
          'user-interaction': mcpServer,
        },
      },
    });

    let finalResult: string | undefined;
    let finalCost: number | undefined;

    for await (const message of conversation) {
      if (abortController.signal.aborted) break;
      const outcome = await processClaudeMessage(ctx, message);
      if (outcome) {
        finalResult = outcome.result;
        finalCost = outcome.costUsd;
      }
    }

    return { result: finalResult, costUsd: finalCost };
  },
};

async function processClaudeMessage(
  ctx: RunContext,
  message: SDKMessage,
): Promise<{ result?: string; costUsd?: number } | null> {
  if (ctx.abortController.signal.aborted) return null;

  switch (message.type) {
    case 'assistant': {
      const textBlocks = message.message.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text);
      if (textBlocks.length > 0) {
        const text = textBlocks.join('\n');
        const logText = text.length > 2000 ? text.slice(0, 2000) + '... (truncated)' : text;
        await ctx.logTask('info', logText);
      }
      return null;
    }

    case 'result': {
      if (message.subtype === 'success') {
        return { result: message.result, costUsd: message.total_cost_usd };
      } else {
        const errorMsg = 'errors' in message && Array.isArray(message.errors)
          ? message.errors.join('; ')
          : `SDK error: ${message.subtype}`;
        throw new Error(errorMsg);
      }
    }

    case 'system': {
      if (message.subtype === 'init') {
        await ctx.logTask('debug', `SDK initialized. Model: ${message.model}, Tools: ${message.tools.length}`);
      }
      return null;
    }

    default:
      return null;
  }
}
```

**Step 3: Refactor task-runner.ts to use runner abstraction**

Replace `server/src/services/task-runner.ts` with a simplified dispatcher:

```typescript
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';
import { buildBranchName } from './prompt-builder.js';
import { logTask, broadcastTaskStatus } from './runners/types.js';
import { claudeRunner } from './runners/claude-runner.js';
import { codexRunner } from './runners/codex-runner.js';
import type { Task, Repo, TaskStatus } from '@fastvibe/shared';

// Map of taskId -> AbortController for cancellation
const runningTasks = new Map<string, AbortController>();

export function getAbortController(taskId: string): AbortController | undefined {
  return runningTasks.get(taskId);
}

const runners = {
  'claude-code': claudeRunner,
  'codex': codexRunner,
} as const;

export async function runTask(task: Task, repo: Repo): Promise<void> {
  const db = getDb();
  const abortController = new AbortController();
  runningTasks.set(task.id, abortController);

  try {
    // 1. Update task status to RUNNING
    const branchName = buildBranchName(task);
    await db
      .update(schema.tasks)
      .set({
        status: 'RUNNING' as TaskStatus,
        startedAt: new Date().toISOString(),
        branchName,
      })
      .where(eq(schema.tasks.id, task.id));

    await broadcastTaskStatus(task.id, repo.id, 'RUNNING');
    await logTask(task.id, 'info', `Task started (${task.agentType}). Branch: ${branchName}`);

    // 2. Select runner based on agent type
    const agentType = task.agentType ?? 'claude-code';
    const runner = runners[agentType as keyof typeof runners];
    if (!runner) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    // 3. Run with the selected runner
    const ctx = {
      task,
      repo,
      abortController,
      logTask: (level: any, message: string) => logTask(task.id, level, message),
      broadcastStatus: (status: TaskStatus) => broadcastTaskStatus(task.id, repo.id, status),
    };

    const { result, costUsd } = await runner.run(ctx);

    // 4. Mark as completed (if runner didn't throw)
    if (!abortController.signal.aborted) {
      await db
        .update(schema.tasks)
        .set({
          status: 'COMPLETED' as TaskStatus,
          result: result ?? null,
          costUsd: costUsd ?? null,
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.tasks.id, task.id));

      await broadcastTaskStatus(task.id, repo.id, 'COMPLETED');
      const costStr = costUsd != null ? ` Cost: $${costUsd.toFixed(4)}` : '';
      await logTask(task.id, 'info', `Task completed.${costStr}`);
      eventBus.emit('task:completed', task.id);
    }
  } catch (err: any) {
    if (abortController.signal.aborted) {
      await logTask(task.id, 'info', 'Task was cancelled');
      return;
    }

    const errorMessage = err?.message || String(err);
    await db
      .update(schema.tasks)
      .set({
        status: 'FAILED' as TaskStatus,
        errorMessage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.tasks.id, task.id));

    await broadcastTaskStatus(task.id, repo.id, 'FAILED');
    await logTask(task.id, 'error', `Task failed: ${errorMessage}`);
    eventBus.emit('task:failed', task.id);
  } finally {
    runningTasks.delete(task.id);
  }
}
```

**Step 4: Commit**

```bash
git add server/src/services/runners/ server/src/services/task-runner.ts
git commit -m "refactor: extract claude runner, add runner abstraction"
```

---

### Task 5: Codex runner implementation

**Files:**
- Create: `server/src/services/runners/codex-runner.ts`
- Modify: `server/package.json` (add `@openai/codex-sdk` dependency)

**Step 1: Install codex SDK**

Run: `pnpm --filter @fastvibe/server add @openai/codex-sdk`

**Step 2: Create codex runner**

Create `server/src/services/runners/codex-runner.ts`:

```typescript
import { Codex } from '@openai/codex-sdk';
import { buildPrompt, buildBranchName } from '../prompt-builder.js';
import type { AgentRunner, RunContext } from './types.js';

export const codexRunner: AgentRunner = {
  async run(ctx: RunContext): Promise<{ result?: string; costUsd?: number }> {
    const { task, repo, abortController } = ctx;

    await ctx.logTask('info', `Starting Codex agent with model: ${task.model}`);

    const codex = new Codex({
      config: {
        model: task.model,
        approval_policy: 'never',
      },
    });

    const thread = codex.startThread({
      workingDirectory: repo.path,
    });

    const prompt = buildPrompt(task, repo);

    // Use streamed run to capture events for logging
    const { events } = await thread.runStreamed(prompt);

    let finalResponse: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for await (const event of events) {
      if (abortController.signal.aborted) break;

      switch (event.type) {
        case 'item.completed': {
          const item = event.item;
          if (item.type === 'agent_message') {
            const text = item.content;
            if (text) {
              const logText = text.length > 2000 ? text.slice(0, 2000) + '... (truncated)' : text;
              await ctx.logTask('info', logText);
              finalResponse = text;
            }
          } else if (item.type === 'command_execution') {
            const cmd = item.command || '';
            const output = item.output || '';
            await ctx.logTask('debug', `$ ${cmd}\n${output.length > 1000 ? output.slice(0, 1000) + '...' : output}`);
          } else if (item.type === 'file_change') {
            await ctx.logTask('debug', `File changed: ${(item as any).path || 'unknown'}`);
          }
          break;
        }
        case 'turn.completed': {
          if (event.usage) {
            totalInputTokens += event.usage.input_tokens || 0;
            totalOutputTokens += event.usage.output_tokens || 0;
            await ctx.logTask('info', `Turn completed. Tokens: ${event.usage.input_tokens} in / ${event.usage.output_tokens} out`);
          }
          break;
        }
      }
    }

    return { result: finalResponse };
  },
};
```

**Step 3: Commit**

```bash
git add server/src/services/runners/codex-runner.ts server/package.json pnpm-lock.yaml
git commit -m "feat: add codex runner using @openai/codex-sdk"
```

---

### Task 6: Frontend type updates and API

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/stores/app-store.ts`

**Step 1: Update API client**

In `web/src/lib/api.ts`:

Replace the `ClaudeDefaults` import with `AgentDefaults`:
```typescript
import type {
  Repo,
  Task,
  CreateRepoRequest,
  CreateTaskRequest,
  TaskStatus,
  AppConfig,
  AgentDefaults,
} from '@fastvibe/shared';
```

Add `agentType` to `RestartTaskOptions`:
```typescript
export interface RestartTaskOptions {
  prompt?: string;
  title?: string;
  model?: string;
  maxBudgetUsd?: number;
  interactionTimeout?: number;
  thinkingEnabled?: boolean;
  language?: 'zh' | 'en';
  agentType?: 'claude-code' | 'codex';
}
```

Replace `fetchClaudeDefaults`:
```typescript
export function fetchAgentDefaults(): Promise<AgentDefaults> {
  return request<AgentDefaults>('/api/config/agent-defaults');
}
```

**Step 2: Update Zustand store**

In `web/src/stores/app-store.ts`:

Replace `ClaudeDefaults` import with `AgentDefaults`.

In `AppState` interface:
- Change `claudeDefaults: ClaudeDefaults | null;` → `agentDefaults: AgentDefaults | null;`
- Change `fetchClaudeDefaults: () => Promise<void>;` → `fetchAgentDefaults: () => Promise<void>;`

In store implementation:
- Change initial state: `claudeDefaults: null` → `agentDefaults: null`
- Replace `fetchClaudeDefaults` action:
```typescript
  fetchAgentDefaults: async () => {
    try {
      const defaults = await api.fetchAgentDefaults();
      set({ agentDefaults: defaults });
    } catch (err) {
      console.error('Failed to fetch agent defaults:', err);
    }
  },
```

**Step 3: Commit**

```bash
git add web/src/lib/api.ts web/src/stores/app-store.ts
git commit -m "feat: update frontend API and store for agent defaults"
```

---

### Task 7: i18n updates

**Files:**
- Modify: `web/src/i18n/zh.ts`
- Modify: `web/src/i18n/en.ts`

**Step 1: Add agent-related i18n keys**

In `zh.ts`, add to `taskForm` section (after `voiceNotSupported`):
```typescript
    agentType: 'Agent 类型',
    agentClaudeCode: 'Claude Code',
    agentCodex: 'Codex',
```

Add to `taskDetail` section (after `configSeconds`):
```typescript
    configAgent: 'Agent 类型',
```

Add to `restartDialog` section (after `cancel`):
```typescript
    agentType: 'Agent 类型',
```

Add to `config` section (after `cancel`):
```typescript
    defaultAgent: '默认 Agent',
```

In `en.ts`, add the corresponding keys:
- `taskForm`: `agentType: 'Agent Type'`, `agentClaudeCode: 'Claude Code'`, `agentCodex: 'Codex'`
- `taskDetail`: `configAgent: 'Agent Type'`
- `restartDialog`: `agentType: 'Agent Type'`
- `config`: `defaultAgent: 'Default Agent'`

Update the `Translations` interface in `zh.ts` to include all new keys in the respective sections.

**Step 2: Commit**

```bash
git add web/src/i18n/zh.ts web/src/i18n/en.ts
git commit -m "feat: add i18n keys for agent type selection"
```

---

### Task 8: Frontend TaskForm agent selector

**Files:**
- Modify: `web/src/components/TaskForm.tsx`

**Step 1: Add agent type selector**

Add state: `const [agentType, setAgentType] = useState<'claude-code' | 'codex'>(agentDefaults?.defaultAgent ?? 'claude-code');`

Replace `claudeDefaults` references with `agentDefaults`.

Add an "Agent Type" selector before the prompt field (above the textarea), using two radio-style buttons or a CustomSelect:

```tsx
{/* Agent Type */}
<div>
  <label className="block text-sm font-medium text-ink-3 mb-1.5">{t.taskForm.agentType}</label>
  <div className="flex gap-2">
    {(['claude-code', 'codex'] as const).map((type) => (
      <button
        key={type}
        type="button"
        onClick={() => { setAgentType(type); setModel(''); }}
        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          agentType === type
            ? 'border-brand-500 bg-brand-500/10 text-brand-400'
            : 'border-th-border bg-th-input text-ink-3 hover:border-th-border-strong'
        }`}
        disabled={submitting}
      >
        {type === 'claude-code' ? t.taskForm.agentClaudeCode : t.taskForm.agentCodex}
      </button>
    ))}
  </div>
</div>
```

In the model selector (advanced settings), dynamically switch models based on `agentType`:

```tsx
const currentModels = agentType === 'codex'
  ? agentDefaults?.codex.models ?? []
  : agentDefaults?.claude.models ?? [];
const currentDefaultModel = agentType === 'codex'
  ? agentDefaults?.codex.defaultModel ?? 'o3'
  : agentDefaults?.claude.defaultModel ?? 'claude-sonnet-4-6';
```

Include `agentType` in the `createTask()` call:
```typescript
await createTask({
  ...otherFields,
  agentType,
});
```

**Step 2: Commit**

```bash
git add web/src/components/TaskForm.tsx
git commit -m "feat: add agent type selector to task form"
```

---

### Task 9: Frontend TaskDetail and TaskCard agent display

**Files:**
- Modify: `web/src/components/TaskDetail.tsx`
- Modify: `web/src/components/TaskCard.tsx`
- Modify: `web/src/components/RestartDialog.tsx`

**Step 1: Show agent type in TaskDetail**

In the config grid (inside `showConfig` block), add a row for agent type:

```tsx
<div>
  <span className="text-xs text-ink-hint">{t.taskDetail.configAgent}</span>
  <p className="text-sm text-ink-3">{taskDetail.agentType === 'codex' ? 'Codex' : 'Claude Code'}</p>
</div>
```

**Step 2: Show agent type badge in TaskCard**

Optionally show a small badge next to the status badge when the agent is Codex (since Claude Code is the default, only show when different):

```tsx
{task.agentType === 'codex' && (
  <span className="badge border border-emerald-400/20 bg-emerald-400/10 text-emerald-400 text-[10px]">
    Codex
  </span>
)}
```

**Step 3: Update RestartDialog**

Replace `claudeDefaults` with `agentDefaults` and add agent type selector (similar to TaskForm).

**Step 4: Commit**

```bash
git add web/src/components/TaskDetail.tsx web/src/components/TaskCard.tsx web/src/components/RestartDialog.tsx
git commit -m "feat: display agent type in task detail and card"
```

---

### Task 10: ConfigPanel default agent setting

**Files:**
- Modify: `web/src/components/ConfigPanel.tsx`

**Step 1: Add default agent setting**

In the "Interface Settings" section of ConfigPanel, add a "Default Agent" selector after the theme toggle:

```tsx
{/* Default Agent */}
<div className="flex items-center justify-between">
  <span className="text-sm text-ink-3">{t.config.defaultAgent}</span>
  <CustomSelect
    options={[
      { value: 'claude-code', label: 'Claude Code' },
      { value: 'codex', label: 'Codex' },
    ]}
    value={agentDefaults?.defaultAgent ?? 'claude-code'}
    onChange={async (val) => {
      await api.updateConfig({ defaultAgent: val as any });
      fetchAgentDefaults();
    }}
  />
</div>
```

Note: This requires the PUT `/api/config` endpoint to support updating `defaultAgent`. Check if it already does; if not, update the config route.

**Step 2: Commit**

```bash
git add web/src/components/ConfigPanel.tsx
git commit -m "feat: add default agent setting to config panel"
```

---

### Task 11: README documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`

**Step 1: Document Codex support**

Add a section about Codex support noting:
- FastVibe supports both Claude Code and OpenAI Codex as code agents
- Set `defaultAgent` in `config.yaml` to choose the default
- Per-task agent selection available in the task creation form
- Codex requires `CODEX_API_KEY` (or `OPENAI_API_KEY`) environment variable
- **Limitation**: Codex tasks run in full-auto mode — user interaction (ask_user) is not supported for Codex tasks

**Step 2: Update config.yaml example in README to show Codex config**

**Step 3: Commit**

```bash
git add README.md README.zh.md
git commit -m "docs: document Codex support and limitations"
```

---

### Task 12: Final typecheck and verification

**Step 1: Run full typecheck**

Run: `pnpm --filter @fastvibe/shared run typecheck && pnpm --filter @fastvibe/server run typecheck && pnpm --filter @fastvibe/web run typecheck`
Expected: All pass

**Step 2: Build**

Run: `pnpm --filter @fastvibe/server run build && pnpm --filter @fastvibe/web run build`
Expected: All pass

**Step 3: Fix any remaining issues and commit**
