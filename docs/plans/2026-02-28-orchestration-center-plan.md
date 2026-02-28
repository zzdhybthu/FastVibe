# VibeCoding Orchestration Center - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade Claude Code orchestration center with Web UI, task queue, Docker isolation, and git worktree automation.

**Architecture:** pnpm monorepo with three packages (server, web, shared). Server uses Fastify + Claude Agent SDK + Drizzle ORM (SQLite). Frontend uses React + Vite + Zustand + TailwindCSS. Real-time communication via WebSocket. Each task runs in an isolated Docker container.

**Tech Stack:** TypeScript, Node.js 24, pnpm, Fastify, @anthropic-ai/claude-agent-sdk, Drizzle ORM, better-sqlite3, React 18, Vite, Zustand, TailwindCSS, dockerode, ws, zod, vitest

**Design doc:** `docs/plans/2026-02-28-orchestration-center-design.md`

**Test repo for integration tests:** `~/VibeTest` (git@github.com:zzdhybthu/VibeTest.git)

**API proxy:** `https://api9.xhub.chat` (configured in `~/.claude/settings.json`)

---

## Task 1: Project Scaffold - pnpm Workspace

**Files:**
- Create: `vibecoding-v2/pnpm-workspace.yaml`
- Create: `vibecoding-v2/package.json`
- Create: `vibecoding-v2/tsconfig.base.json`
- Create: `vibecoding-v2/.gitignore`
- Create: `vibecoding-v2/.npmrc`

**Step 1: Create workspace root**

```bash
mkdir -p vibecoding-v2
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

**Step 3: Create root package.json**

```json
{
  "name": "vibecoding-v2",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @vibecoding/server dev",
    "dev:web": "pnpm --filter @vibecoding/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "engines": {
    "node": ">=22"
  }
}
```

**Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.db
*.db-journal
.env
.vite/
```

**Step 6: Create .npmrc**

```
shamefully-hoist=false
strict-peer-dependencies=false
```

**Step 7: Run pnpm install to initialize lockfile**

```bash
cd vibecoding-v2 && pnpm install
```

**Step 8: Commit**

```bash
git add vibecoding-v2/
git commit -m "chore(v2): scaffold pnpm workspace root"
```

---

## Task 2: Shared Package - Types and Constants

**Files:**
- Create: `vibecoding-v2/packages/shared/package.json`
- Create: `vibecoding-v2/packages/shared/tsconfig.json`
- Create: `vibecoding-v2/packages/shared/src/types.ts`
- Create: `vibecoding-v2/packages/shared/src/constants.ts`
- Create: `vibecoding-v2/packages/shared/src/index.ts`

**Step 1: Create shared/package.json**

```json
{
  "name": "@vibecoding/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create types.ts**

Define all shared types matching the design doc schema:

```typescript
// Task statuses
export type TaskStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'AWAITING_INPUT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type InteractionStatus = 'pending' | 'answered' | 'timeout';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// --- DB row types ---

export interface Repo {
  id: string;
  path: string;
  name: string;
  mainBranch: string;
  maxConcurrency: number;
  gitUser: string;
  gitEmail: string;
  createdAt: string;
}

export interface Task {
  id: string;
  repoId: string;
  title: string | null;
  prompt: string;
  status: TaskStatus;
  thinkingEnabled: boolean;
  predecessorTaskId: string | null;
  branchName: string | null;
  worktreePath: string | null;
  sessionId: string | null;
  dockerContainerId: string | null;
  result: string | null;
  errorMessage: string | null;
  costUsd: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface TaskInteraction {
  id: string;
  taskId: string;
  questionData: string; // JSON
  answerData: string | null; // JSON
  status: InteractionStatus;
  createdAt: string;
  answeredAt: string | null;
}

export interface TaskLog {
  id: number;
  taskId: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

// --- API request/response types ---

export interface CreateRepoRequest {
  path: string;
  name: string;
  mainBranch?: string;
  maxConcurrency?: number;
  gitUser: string;
  gitEmail: string;
}

export interface CreateTaskRequest {
  prompt: string;
  title?: string;
  thinkingEnabled?: boolean;
  predecessorTaskId?: string;
}

export interface AnswerInteractionRequest {
  answer: string;
}

// --- WebSocket event types ---

export type WsServerEvent =
  | { type: 'task:status'; taskId: string; repoId: string; status: TaskStatus; task: Task }
  | { type: 'task:log'; taskId: string; level: LogLevel; message: string; timestamp: string }
  | { type: 'task:interaction'; taskId: string; interactionId: string; questionData: unknown }
  | { type: 'ping' };

export type WsClientEvent =
  | { type: 'subscribe'; repoId: string }
  | { type: 'unsubscribe'; repoId: string }
  | { type: 'interaction:answer'; interactionId: string; answer: string };

// --- Config types ---

export interface AppConfig {
  server: {
    port: number;
    host: string;
    authToken: string;
  };
  global: {
    maxTotalConcurrency: number;
  };
  repos: Array<{
    path: string;
    name: string;
    mainBranch: string;
    maxConcurrency: number;
    git: { user: string; email: string };
  }>;
  docker: {
    image: string;
    binds: string[];
    networkMode: string;
  };
  claude: {
    model: string;
    maxBudgetUsd: number;
    interactionTimeout: number;
  };
}
```

**Step 4: Create constants.ts**

```typescript
export const TERMINAL_STATUSES: readonly string[] = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;
export const DEFAULT_PORT = 8420;
export const DEFAULT_MAX_CONCURRENCY = 3;
export const DEFAULT_INTERACTION_TIMEOUT = 1800; // seconds
export const DEFAULT_MAX_BUDGET_USD = 5.0;
export const PROMPT_TITLE_MAX_LEN = 50;
```

**Step 5: Create index.ts barrel export**

```typescript
export * from './types.js';
export * from './constants.js';
```

**Step 6: Install deps and typecheck**

```bash
cd vibecoding-v2 && pnpm install && pnpm --filter @vibecoding/shared typecheck
```

**Step 7: Commit**

```bash
git add vibecoding-v2/packages/shared/
git commit -m "feat(v2/shared): add shared types and constants"
```

---

## Task 3: Server Package - Scaffold and Config

**Files:**
- Create: `vibecoding-v2/packages/server/package.json`
- Create: `vibecoding-v2/packages/server/tsconfig.json`
- Create: `vibecoding-v2/packages/server/src/config.ts`
- Create: `vibecoding-v2/packages/server/src/index.ts` (minimal)
- Create: `vibecoding-v2/config.example.yaml`

**Step 1: Create server/package.json**

```json
{
  "name": "@vibecoding/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@vibecoding/shared": "workspace:*",
    "fastify": "^5.0.0",
    "@fastify/cors": "^11.0.0",
    "@fastify/websocket": "^11.0.0",
    "drizzle-orm": "^0.39.0",
    "better-sqlite3": "^11.0.0",
    "dockerode": "^4.0.0",
    "yaml": "^2.6.0",
    "zod": "^3.24.0",
    "uuid": "^11.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/dockerode": "^3.3.0",
    "@types/uuid": "^10.0.0",
    "@types/ws": "^8.5.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create config.example.yaml at workspace root**

```yaml
server:
  port: 8420
  host: '0.0.0.0'
  authToken: 'change-me-to-a-secret-token'

global:
  maxTotalConcurrency: 5

repos: []
  # - path: '/home/user/my-project'
  #   name: 'my-project'
  #   mainBranch: 'main'
  #   maxConcurrency: 3
  #   git:
  #     user: 'username'
  #     email: 'user@example.com'

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

**Step 4: Create src/config.ts**

Config loader that reads `config.yaml` from workspace root (or path from `CONFIG_PATH` env var), validates with zod, and exports a typed config object.

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { AppConfig } from '@vibecoding/shared';

const configSchema = z.object({
  server: z.object({
    port: z.number().default(8420),
    host: z.string().default('0.0.0.0'),
    authToken: z.string(),
  }),
  global: z.object({
    maxTotalConcurrency: z.number().default(5),
  }),
  repos: z.array(z.object({
    path: z.string(),
    name: z.string(),
    mainBranch: z.string().default('main'),
    maxConcurrency: z.number().default(3),
    git: z.object({
      user: z.string(),
      email: z.string(),
    }),
  })).default([]),
  docker: z.object({
    image: z.string().default('vibecoding-worker:latest'),
    binds: z.array(z.string()).default([]),
    networkMode: z.string().default('host'),
  }),
  claude: z.object({
    model: z.string().default('claude-sonnet-4-6'),
    maxBudgetUsd: z.number().default(5.0),
    interactionTimeout: z.number().default(1800),
  }),
});

export function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH
    || resolve(import.meta.dirname, '../../config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw);
  return configSchema.parse(parsed);
}
```

**Step 5: Create minimal src/index.ts**

```typescript
import { loadConfig } from './config.js';

const config = loadConfig();
console.log(`VibeCoding v2 server starting on ${config.server.host}:${config.server.port}`);
```

**Step 6: Install dependencies**

```bash
cd vibecoding-v2 && pnpm install
```

**Step 7: Create a test config.yaml in vibecoding-v2/ and verify it loads**

```bash
cp vibecoding-v2/config.example.yaml vibecoding-v2/config.yaml
# Edit config.yaml to set a test authToken
cd vibecoding-v2 && pnpm --filter @vibecoding/server dev
# Verify output: "VibeCoding v2 server starting on 0.0.0.0:8420"
# Ctrl+C
```

**Step 8: Add config.yaml to .gitignore, commit**

Add `config.yaml` (but not `config.example.yaml`) to `.gitignore`.

```bash
git add vibecoding-v2/packages/server/ vibecoding-v2/config.example.yaml
git commit -m "feat(v2/server): scaffold server package with config loader"
```

---

## Task 4: Database Schema and Migrations

**Files:**
- Create: `vibecoding-v2/packages/server/src/db/schema.ts`
- Create: `vibecoding-v2/packages/server/src/db/index.ts`
- Create: `vibecoding-v2/packages/server/drizzle.config.ts`

**Step 1: Create db/schema.ts**

Drizzle ORM schema matching design doc tables: repos, tasks, task_interactions, task_logs.

```typescript
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  mainBranch: text('main_branch').notNull().default('main'),
  maxConcurrency: integer('max_concurrency').notNull().default(3),
  gitUser: text('git_user').notNull(),
  gitEmail: text('git_email').notNull(),
  createdAt: text('created_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull().references(() => repos.id),
  title: text('title'),
  prompt: text('prompt').notNull(),
  status: text('status').notNull().default('PENDING'),
  thinkingEnabled: integer('thinking_enabled', { mode: 'boolean' }).notNull().default(false),
  predecessorTaskId: text('predecessor_task_id'),
  branchName: text('branch_name'),
  worktreePath: text('worktree_path'),
  sessionId: text('session_id'),
  dockerContainerId: text('docker_container_id'),
  result: text('result'),
  errorMessage: text('error_message'),
  costUsd: real('cost_usd'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull(),
});

export const taskInteractions = sqliteTable('task_interactions', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  questionData: text('question_data').notNull(),
  answerData: text('answer_data'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  answeredAt: text('answered_at'),
});

export const taskLogs = sqliteTable('task_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull().references(() => tasks.id),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  timestamp: text('timestamp').notNull(),
});
```

**Step 2: Create db/index.ts**

```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>>;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  return db;
}

export { schema };
```

**Step 3: Create drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/vibecoding.db',
  },
});
```

**Step 4: Generate initial migration**

```bash
cd vibecoding-v2/packages/server
pnpm drizzle-kit generate
```

**Step 5: Add migration runner to db/index.ts**

After `initDb`, run `migrate(db, { migrationsFolder: ... })`.

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';

export function initDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });
  return db;
}
```

**Step 6: Verify migration runs**

```bash
mkdir -p vibecoding-v2/packages/server/data
cd vibecoding-v2 && pnpm --filter @vibecoding/server dev
# Should start without errors, creating data/vibecoding.db
```

**Step 7: Commit**

```bash
git add vibecoding-v2/packages/server/src/db/ vibecoding-v2/packages/server/drizzle* vibecoding-v2/packages/server/drizzle/
git commit -m "feat(v2/server): add database schema and migrations"
```

---

## Task 5: Fastify Server with Auth and CORS

**Files:**
- Create: `vibecoding-v2/packages/server/src/server.ts`
- Modify: `vibecoding-v2/packages/server/src/index.ts`

**Step 1: Create server.ts**

Build the Fastify instance with CORS, auth hook, and static file serving (for production frontend).

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { AppConfig } from '@vibecoding/shared';

export async function buildServer(config: AppConfig) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Auth hook - check Bearer token on /api/* routes
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const auth = request.headers.authorization;
    if (!auth || auth !== `Bearer ${config.server.authToken}`) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
```

**Step 2: Update index.ts**

```typescript
import { loadConfig } from './config.js';
import { initDb } from './db/index.js';
import { buildServer } from './server.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

async function main() {
  const config = loadConfig();

  // Init database
  const dataDir = resolve(import.meta.dirname, '../data');
  mkdirSync(dataDir, { recursive: true });
  initDb(resolve(dataDir, 'vibecoding.db'));

  // Build and start server
  const app = await buildServer(config);
  await app.listen({ port: config.server.port, host: config.server.host });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

**Step 3: Verify server starts and auth works**

```bash
cd vibecoding-v2 && pnpm --filter @vibecoding/server dev &
sleep 2
curl http://localhost:8420/health                        # → {"status":"ok"}
curl http://localhost:8420/api/repos                     # → 401
curl -H "Authorization: Bearer change-me-to-a-secret-token" http://localhost:8420/api/repos  # → (route not found, 404, which is expected)
kill %1
```

**Step 4: Commit**

```bash
git add vibecoding-v2/packages/server/src/
git commit -m "feat(v2/server): fastify server with auth and health check"
```

---

## Task 6: Repos API

**Files:**
- Create: `vibecoding-v2/packages/server/src/routes/repos.ts`
- Modify: `vibecoding-v2/packages/server/src/server.ts` (register routes)

**Step 1: Create routes/repos.ts**

Full CRUD for repos. On server start, also sync repos from config.yaml into the database (upsert).

```typescript
import type { FastifyInstance } from 'fastify';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { AppConfig } from '@vibecoding/shared';

const createRepoSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  mainBranch: z.string().default('main'),
  maxConcurrency: z.number().int().min(1).default(3),
  gitUser: z.string().min(1),
  gitEmail: z.string().email(),
});

export async function repoRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/repos
  app.get('/api/repos', async () => {
    return db.select().from(schema.repos).all();
  });

  // POST /api/repos
  app.post('/api/repos', async (request, reply) => {
    const body = createRepoSchema.parse(request.body);
    const repo = {
      id: uuid(),
      ...body,
      createdAt: new Date().toISOString(),
    };
    await db.insert(schema.repos).values(repo);
    reply.code(201).send(repo);
  });

  // PUT /api/repos/:id
  app.put<{ Params: { id: string } }>('/api/repos/:id', async (request, reply) => {
    const body = createRepoSchema.partial().parse(request.body);
    const result = await db.update(schema.repos)
      .set(body)
      .where(eq(schema.repos.id, request.params.id))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Not found' });
    return result[0];
  });

  // DELETE /api/repos/:id
  app.delete<{ Params: { id: string } }>('/api/repos/:id', async (request, reply) => {
    const result = await db.delete(schema.repos)
      .where(eq(schema.repos.id, request.params.id))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: 'Not found' });
    return { deleted: true };
  });
}

// Sync repos from config.yaml into database on startup
export async function syncReposFromConfig(config: AppConfig) {
  const db = getDb();
  for (const repoConfig of config.repos) {
    const existing = await db.select().from(schema.repos)
      .where(eq(schema.repos.path, repoConfig.path))
      .get();
    if (existing) {
      await db.update(schema.repos)
        .set({
          name: repoConfig.name,
          mainBranch: repoConfig.mainBranch,
          maxConcurrency: repoConfig.maxConcurrency,
          gitUser: repoConfig.git.user,
          gitEmail: repoConfig.git.email,
        })
        .where(eq(schema.repos.path, repoConfig.path));
    } else {
      await db.insert(schema.repos).values({
        id: uuid(),
        path: repoConfig.path,
        name: repoConfig.name,
        mainBranch: repoConfig.mainBranch,
        maxConcurrency: repoConfig.maxConcurrency,
        gitUser: repoConfig.git.user,
        gitEmail: repoConfig.git.email,
        createdAt: new Date().toISOString(),
      });
    }
  }
}
```

**Step 2: Register in server.ts**

Add `import { repoRoutes } from './routes/repos.js'` and call `await app.register(repoRoutes)` inside `buildServer`.

**Step 3: Call syncReposFromConfig in index.ts after initDb**

**Step 4: Test manually with curl**

```bash
# Start server, then:
curl -X POST -H "Authorization: Bearer ..." -H "Content-Type: application/json" \
  -d '{"path":"/home/ziyichen/VibeTest","name":"VibeTest","gitUser":"ziyichen","gitEmail":"test@test.com"}' \
  http://localhost:8420/api/repos
curl -H "Authorization: Bearer ..." http://localhost:8420/api/repos
```

**Step 5: Commit**

```bash
git commit -am "feat(v2/server): add repos CRUD API with config sync"
```

---

## Task 7: Tasks API

**Files:**
- Create: `vibecoding-v2/packages/server/src/routes/tasks.ts`
- Modify: `vibecoding-v2/packages/server/src/server.ts` (register routes)

**Step 1: Create routes/tasks.ts**

CRUD for tasks with status filtering, creation (with auto-title from prompt), cancellation, deletion, and bulk deletion.

Key logic:
- `POST /api/repos/:repoId/tasks` — create task. If `predecessorTaskId` is set and predecessor is not terminal, set status to `PENDING`. Otherwise set to `QUEUED`.
- `GET /api/repos/:repoId/tasks?status=QUEUED,RUNNING` — filter by comma-separated statuses
- `GET /api/tasks/:id` — full detail with interactions and recent logs
- `POST /api/tasks/:id/cancel` — cancel PENDING/QUEUED/RUNNING/AWAITING_INPUT tasks
- `DELETE /api/tasks/:id` — only delete terminal tasks
- `DELETE /api/repos/:repoId/tasks/bulk?status=COMPLETED` — bulk delete

**Step 2: Register in server.ts**

**Step 3: Test with curl**

**Step 4: Commit**

```bash
git commit -am "feat(v2/server): add tasks CRUD API"
```

---

## Task 8: Interactions API

**Files:**
- Create: `vibecoding-v2/packages/server/src/routes/interactions.ts`
- Modify: `vibecoding-v2/packages/server/src/server.ts`

**Step 1: Create routes/interactions.ts**

- `POST /api/interactions/:id/answer` — answer a pending interaction. Update interaction status to `answered`, store the answer. Emit event for the task runner to resume.

**Step 2: Register and test**

**Step 3: Commit**

```bash
git commit -am "feat(v2/server): add interactions answer API"
```

---

## Task 9: WebSocket Handler

**Files:**
- Create: `vibecoding-v2/packages/server/src/ws/handler.ts`
- Create: `vibecoding-v2/packages/server/src/ws/event-bus.ts`
- Modify: `vibecoding-v2/packages/server/src/server.ts`

**Step 1: Create ws/event-bus.ts**

A typed EventEmitter singleton that services use to broadcast events (task status changes, logs, interactions). WebSocket handler subscribes to these events.

```typescript
import { EventEmitter } from 'node:events';
import type { WsServerEvent } from '@vibecoding/shared';

class EventBus extends EventEmitter {
  emit(event: 'ws:broadcast', data: WsServerEvent): boolean;
  emit(event: 'interaction:answered', interactionId: string, answer: string): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }
  // ... typed on() overloads
}

export const eventBus = new EventBus();
```

**Step 2: Create ws/handler.ts**

Register `@fastify/websocket` plugin. On connection, verify token from query string. Track subscriptions per client. Listen to eventBus and forward matching events.

**Step 3: Register in server.ts, test with wscat**

```bash
pnpm add -g wscat
wscat -c "ws://localhost:8420/ws?token=change-me-to-a-secret-token"
# Should connect
```

**Step 4: Commit**

```bash
git commit -am "feat(v2/server): add WebSocket handler with event bus"
```

---

## Task 10: Task Queue Service

**Files:**
- Create: `vibecoding-v2/packages/server/src/services/task-queue.ts`
- Create: `vibecoding-v2/packages/server/src/services/__tests__/task-queue.test.ts`

**Step 1: Write tests for task queue logic**

Test cases:
- Task without predecessor starts as QUEUED
- Task with unfinished predecessor starts as PENDING
- When predecessor completes, dependent task transitions to QUEUED
- Concurrency limits are respected (repo-level and global)
- `processQueue()` picks up QUEUED tasks in FIFO order
- Cancelling a QUEUED task works
- Cancelling a PENDING task works

```bash
cd vibecoding-v2 && pnpm --filter @vibecoding/server test
# Expected: all tests FAIL (module not found)
```

**Step 2: Implement task-queue.ts**

Core class `TaskQueue` with methods:
- `enqueue(task)` — add task, set PENDING or QUEUED based on predecessor
- `processQueue()` — called periodically or on events; picks QUEUED tasks up to concurrency limit, returns tasks to run
- `onTaskCompleted(taskId)` — check if any PENDING tasks depended on this, transition to QUEUED
- `onTaskFailed(taskId)` / `onTaskCancelled(taskId)` — same check
- `cancelTask(taskId)` — transition to CANCELLED if PENDING/QUEUED, or signal abort if RUNNING
- `getRunningCount(repoId)` — count RUNNING tasks for a repo
- `getTotalRunningCount()` — global count

Uses the database for persistence and eventBus for notifications.

**Step 3: Run tests, verify pass**

```bash
pnpm --filter @vibecoding/server test
# Expected: all PASS
```

**Step 4: Commit**

```bash
git commit -am "feat(v2/server): implement task queue with concurrency and predecessor logic"
```

---

## Task 11: Docker Service

**Files:**
- Create: `vibecoding-v2/packages/server/src/services/docker.ts`

**Step 1: Implement docker.ts**

Wraps dockerode. Methods:
- `createWorkerContainer(task, repo, config)` — create container with all binds, labels, env vars. Returns container ID.
- `removeContainer(containerId)` — stop and remove
- `cleanupOrphanContainers()` — find all containers with `vibecoding.task-id` label, remove those whose task is not RUNNING
- `isContainerRunning(containerId)` — check status

```typescript
import Docker from 'dockerode';
import type { AppConfig, Task, Repo } from '@vibecoding/shared';

const docker = new Docker();

export async function createWorkerContainer(
  task: Task,
  repo: Repo,
  config: AppConfig
): Promise<string> {
  const binds = [
    `${repo.path}:${repo.path}`,   // mount at same path for consistency
    ...config.docker.binds.map(b => b.replace('~', process.env.HOME!)),
  ];

  const container = await docker.createContainer({
    Image: config.docker.image,
    Cmd: ['sleep', 'infinity'],
    HostConfig: {
      Binds: binds,
      NetworkMode: config.docker.networkMode,
    },
    Labels: {
      'vibecoding.task-id': task.id,
      'vibecoding.repo-id': task.repoId,
    },
    WorkingDir: repo.path,
    Env: [
      // API key will be passed from host env
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
      `ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL || ''}`,
    ],
  });

  await container.start();
  return container.id;
}

export async function removeContainer(containerId: string) {
  try {
    const container = docker.getContainer(containerId);
    await container.stop().catch(() => {}); // may already be stopped
    await container.remove({ force: true });
  } catch (err: any) {
    if (err.statusCode !== 404) throw err;
  }
}

export async function cleanupOrphanContainers() {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ['vibecoding.task-id'] },
  });
  // Remove each — caller should check DB for which are actually orphaned
  return containers;
}

export async function isContainerRunning(containerId: string): Promise<boolean> {
  try {
    const info = await docker.getContainer(containerId).inspect();
    return info.State.Running;
  } catch {
    return false;
  }
}
```

**Step 2: Commit**

```bash
git commit -am "feat(v2/server): add Docker container management service"
```

---

## Task 12: User Interaction Service

**Files:**
- Create: `vibecoding-v2/packages/server/src/services/user-interaction.ts`

**Step 1: Implement user-interaction.ts**

Creates the MCP server with `ask_user` tool. When the tool is called:
1. Insert interaction row in DB
2. Set task status to AWAITING_INPUT
3. Broadcast via eventBus
4. Return a Promise that resolves when `eventBus.on('interaction:answered', id, answer)` fires
5. On resolve: update interaction in DB, set task status back to RUNNING, return answer
6. On timeout: reject with timeout error

```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { eventBus } from '../ws/event-bus.js';
import type { AppConfig } from '@vibecoding/shared';

export function createUserInteractionServer(taskId: string, config: AppConfig) {
  return createSdkMcpServer({
    name: 'user-interaction',
    tools: [
      tool(
        'ask_user',
        '向用户提问并等待回答。当你需要用户确认或选择时使用此工具。',
        {
          question: z.string().describe('要问用户的问题'),
          options: z.array(z.string()).optional().describe('可选的选项列表'),
        },
        async (args) => {
          const db = getDb();
          const interactionId = uuid();
          const now = new Date().toISOString();

          // 1. Create interaction record
          await db.insert(schema.taskInteractions).values({
            id: interactionId,
            taskId,
            questionData: JSON.stringify(args),
            status: 'pending',
            createdAt: now,
          });

          // 2. Update task status
          await db.update(schema.tasks)
            .set({ status: 'AWAITING_INPUT' })
            .where(eq(schema.tasks.id, taskId));

          // 3. Broadcast to WebSocket
          eventBus.emit('ws:broadcast', {
            type: 'task:interaction',
            taskId,
            interactionId,
            questionData: args,
          });

          eventBus.emit('ws:broadcast', {
            type: 'task:status',
            taskId,
            repoId: '', // will be filled by caller
            status: 'AWAITING_INPUT',
            task: {} as any, // simplified
          });

          // 4. Wait for answer
          const answer = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
              eventBus.removeListener('interaction:answered', handler);
              reject(new Error('User interaction timeout'));
            }, config.claude.interactionTimeout * 1000);

            function handler(answeredId: string, userAnswer: string) {
              if (answeredId === interactionId) {
                clearTimeout(timeout);
                resolve(userAnswer);
              }
            }
            eventBus.on('interaction:answered', handler);
          });

          // 5. Update DB
          await db.update(schema.taskInteractions)
            .set({
              answerData: JSON.stringify(answer),
              status: 'answered',
              answeredAt: new Date().toISOString(),
            })
            .where(eq(schema.taskInteractions.id, interactionId));

          await db.update(schema.tasks)
            .set({ status: 'RUNNING' })
            .where(eq(schema.tasks.id, taskId));

          // 6. Return to Claude
          return {
            content: [{ type: 'text' as const, text: answer }],
          };
        }
      ),
    ],
  });
}
```

**Step 2: Commit**

```bash
git commit -am "feat(v2/server): add user interaction MCP bridge"
```

---

## Task 13: Task Runner Service

**Files:**
- Create: `vibecoding-v2/packages/server/src/services/task-runner.ts`
- Create: `vibecoding-v2/packages/server/src/services/prompt-builder.ts`

**Step 1: Create prompt-builder.ts**

Builds the CC prompt from task data and repo config. Includes all the worktree/git/lint/commit/merge instructions from the design doc.

```typescript
import type { Task, Repo, AppConfig } from '@vibecoding/shared';

export function buildPrompt(task: Task, repo: Repo, config: AppConfig): string {
  const displayTitle = task.title || task.prompt.slice(0, 50);
  const branchName = `task-${task.id.slice(0, 8)}-${slugify(displayTitle)}`;

  return `你的任务: ${task.prompt}

执行步骤:
1. 基于 ${repo.mainBranch} 创建新 worktree: git worktree add .claude-worktrees/${branchName} -b ${branchName}
2. cd 进入新 worktree 路径
3. 根据上述任务描述完成开发工作
4. 如需用户确认或选择, 使用 ask_user MCP 工具
5. 完成后, 如果项目有 lint 检查工具或 format 工具可用 (如 eslint, prettier, ruff 等), 执行检查并修复问题
6. git add 相关文件 + git commit, commit message 格式: xxx(yyy): zzz
7. 切回项目根目录 (cd ${repo.path}), 将分支合并到 ${repo.mainBranch}: git checkout ${repo.mainBranch} && git merge ${branchName}
   如有冲突需理解双方的改动意图并解决, 解决后重复步骤 5-7
8. 删除 worktree 和分支: git worktree remove .claude-worktrees/${branchName} && git branch -d ${branchName}
9. push 到远程: git push
10. 遇到重要问题或完成重要改动, 记录在 PROGRESS.md (带 commit id)
11. 无法解决的问题, 以清晰的失败原因结束

Git 配置 (在 worktree 中设置):
  git config user.name "${repo.gitUser}"
  git config user.email "${repo.gitEmail}"

重要: 所有 git 操作都在 ${repo.path} 项目目录或其 worktree 子目录中执行。`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}
```

**Step 2: Create task-runner.ts**

Core execution logic:
- `runTask(task, repo, config)` — async function that:
  1. Creates Docker container
  2. Builds prompt
  3. Creates user interaction MCP server
  4. Calls `query()` from Claude Agent SDK
  5. Streams messages, logging to DB + eventBus
  6. On completion: updates task status, cost, result
  7. On error: updates task with error message
  8. Finally: removes Docker container

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'node:child_process';
import type { AppConfig, Task, Repo } from '@vibecoding/shared';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createWorkerContainer, removeContainer } from './docker.js';
import { createUserInteractionServer } from './user-interaction.js';
import { buildPrompt } from './prompt-builder.js';
import { eventBus } from '../ws/event-bus.js';

const runningTasks = new Map<string, AbortController>();

export function getAbortController(taskId: string) {
  return runningTasks.get(taskId);
}

export async function runTask(task: Task, repo: Repo, config: AppConfig) {
  const db = getDb();
  const abortController = new AbortController();
  runningTasks.set(task.id, abortController);

  let containerId: string | undefined;

  try {
    // Update status to RUNNING
    await db.update(schema.tasks)
      .set({ status: 'RUNNING', startedAt: new Date().toISOString() })
      .where(eq(schema.tasks.id, task.id));
    broadcastTaskStatus(task.id, repo.id, 'RUNNING');

    // Create Docker container
    containerId = await createWorkerContainer(task, repo, config);
    await db.update(schema.tasks)
      .set({ dockerContainerId: containerId })
      .where(eq(schema.tasks.id, task.id));

    // Create MCP server for user interaction
    const mcpServer = createUserInteractionServer(task.id, config);

    // Build prompt
    const prompt = buildPrompt(task, repo, config);

    // Call Claude Agent SDK
    const conversation = query({
      prompt,
      options: {
        cwd: repo.path,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['user', 'project'],
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        tools: { type: 'preset', preset: 'claude_code' },
        thinking: task.thinkingEnabled
          ? { type: 'enabled', budgetTokens: 10000 }
          : { type: 'adaptive' },
        model: config.claude.model,
        maxBudgetUsd: config.claude.maxBudgetUsd,
        abortController,
        mcpServers: {
          'user-interaction': mcpServer,
        },
        spawnClaudeCodeProcess: (opts) => {
          const proc = spawn('docker', [
            'exec', '-i', containerId!,
            'env', '-u', 'CLAUDECODE',
            ...(opts.command || []),
          ], { stdio: ['pipe', 'pipe', 'pipe'] });
          return {
            stdin: proc.stdin,
            stdout: proc.stdout,
            stderr: proc.stderr,
            pid: proc.pid ?? 0,
            kill: (signal?: string) => proc.kill(signal as NodeJS.Signals),
            on: (event: string, handler: (...args: any[]) => void) => {
              proc.on(event, handler);
              return proc;
            },
          } as any;
        },
      },
    });

    // Stream messages
    for await (const message of conversation) {
      if (abortController.signal.aborted) break;
      await handleSDKMessage(message, task.id);
    }

    // Check final result - look at last result message
    await db.update(schema.tasks)
      .set({
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.tasks.id, task.id));
    broadcastTaskStatus(task.id, repo.id, 'COMPLETED');

  } catch (err: any) {
    const errorMessage = err.message || String(err);
    await db.update(schema.tasks)
      .set({
        status: 'FAILED',
        errorMessage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.tasks.id, task.id));
    broadcastTaskStatus(task.id, repo.id, 'FAILED');
    logTask(task.id, 'error', `Task failed: ${errorMessage}`);

  } finally {
    runningTasks.delete(task.id);
    if (containerId) {
      await removeContainer(containerId).catch(() => {});
    }
  }
}

async function handleSDKMessage(message: any, taskId: string) {
  switch (message.type) {
    case 'assistant': {
      // Extract text content for logging
      const textBlocks = message.message?.content?.filter((b: any) => b.type === 'text') || [];
      for (const block of textBlocks) {
        logTask(taskId, 'info', block.text);
      }
      break;
    }
    case 'result': {
      if (message.subtype === 'success') {
        logTask(taskId, 'info', `Task completed. Cost: $${message.total_cost_usd?.toFixed(4)}`);
        const db = getDb();
        await db.update(schema.tasks)
          .set({
            result: message.result,
            costUsd: message.total_cost_usd,
          })
          .where(eq(schema.tasks.id, taskId));
      } else {
        const errors = message.errors?.join('; ') || message.subtype;
        logTask(taskId, 'error', `Task error: ${errors}`);
        throw new Error(errors);
      }
      break;
    }
    case 'system':
      logTask(taskId, 'debug', `System: ${message.subtype}`);
      break;
  }
}

function logTask(taskId: string, level: string, message: string) {
  const db = getDb();
  const timestamp = new Date().toISOString();
  db.insert(schema.taskLogs).values({ taskId, level, message, timestamp }).run();
  eventBus.emit('ws:broadcast', {
    type: 'task:log',
    taskId,
    level: level as any,
    message,
    timestamp,
  });
}

function broadcastTaskStatus(taskId: string, repoId: string, status: string) {
  eventBus.emit('ws:broadcast', {
    type: 'task:status',
    taskId,
    repoId,
    status: status as any,
    task: {} as any, // will be enriched by WS handler
  });
}
```

**Step 3: Commit**

```bash
git commit -am "feat(v2/server): implement task runner with SDK integration"
```

---

## Task 14: Task Queue Integration and Scheduler

**Files:**
- Modify: `vibecoding-v2/packages/server/src/services/task-queue.ts`
- Modify: `vibecoding-v2/packages/server/src/index.ts`

**Step 1: Add scheduler loop**

In `index.ts`, start a periodic scheduler (every 2 seconds) that calls `taskQueue.processQueue()`. When a task is ready, call `runTask()` in the background (don't await it — fire and forget).

Also wire up:
- When tasks API creates a task → call `taskQueue.enqueue()`
- When task runner completes/fails → call `taskQueue.onTaskCompleted()` / `onTaskFailed()`
- Cancel button → call `taskQueue.cancelTask()` which uses `getAbortController()`

**Step 2: Test the full flow manually**

Add VibeTest repo to config.yaml, create a simple task via curl, verify it runs.

**Step 3: Commit**

```bash
git commit -am "feat(v2/server): integrate task queue scheduler with runner"
```

---

## Task 15: Fault Tolerance - Startup Recovery

**Files:**
- Create: `vibecoding-v2/packages/server/src/services/recovery.ts`
- Modify: `vibecoding-v2/packages/server/src/index.ts`

**Step 1: Implement recovery.ts**

On startup:
1. Find tasks in RUNNING/AWAITING_INPUT status
2. Check if their Docker containers still exist
3. If not, mark as FAILED with "Service restarted, task interrupted"
4. Clean up orphan containers
5. Re-process the queue

**Step 2: Call recovery in index.ts before starting scheduler**

**Step 3: Commit**

```bash
git commit -am "feat(v2/server): add startup recovery and orphan cleanup"
```

---

## Task 16: Docker Worker Image

**Files:**
- Create: `vibecoding-v2/docker/Dockerfile.worker`
- Create: `vibecoding-v2/docker/docker-compose.yml`

**Step 1: Create Dockerfile.worker**

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

ENV PATH="/root/.local/bin:$PATH"

WORKDIR /workspace

CMD ["sleep", "infinity"]
```

**Step 2: Create docker-compose.yml** (for building the image)

```yaml
services:
  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    image: vibecoding-worker:latest
```

**Step 3: Build the image**

```bash
cd vibecoding-v2/docker && docker compose build
```

**Step 4: Commit**

```bash
git commit -am "feat(v2/docker): add worker container Dockerfile"
```

---

## Task 17: Frontend Scaffold - React + Vite + TailwindCSS

**Files:**
- Create: `vibecoding-v2/packages/web/package.json`
- Create: `vibecoding-v2/packages/web/vite.config.ts`
- Create: `vibecoding-v2/packages/web/tsconfig.json`
- Create: `vibecoding-v2/packages/web/index.html`
- Create: `vibecoding-v2/packages/web/src/main.tsx`
- Create: `vibecoding-v2/packages/web/src/App.tsx`
- Create: `vibecoding-v2/packages/web/tailwind.config.js`
- Create: `vibecoding-v2/packages/web/postcss.config.js`
- Create: `vibecoding-v2/packages/web/src/index.css`

**Step 1: Create web/package.json**

```json
{
  "name": "@vibecoding/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@vibecoding/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

**Step 2: Create all config files** (vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js)

Vite config should proxy `/api` and `/ws` to the backend server at port 8420.

**Step 3: Create index.html, main.tsx, App.tsx, index.css**

Minimal React app with TailwindCSS dark theme. App.tsx shows "VibeCoding 调度中心" header.

**Step 4: Install deps, verify dev server starts**

```bash
cd vibecoding-v2 && pnpm install && pnpm --filter @vibecoding/web dev
# Open browser, verify page loads
```

**Step 5: Commit**

```bash
git commit -am "feat(v2/web): scaffold React frontend with Vite and TailwindCSS"
```

---

## Task 18: Frontend - Zustand Store and API Client

**Files:**
- Create: `vibecoding-v2/packages/web/src/lib/api.ts`
- Create: `vibecoding-v2/packages/web/src/stores/app-store.ts`
- Create: `vibecoding-v2/packages/web/src/hooks/useWebSocket.ts`

**Step 1: Create api.ts**

Typed fetch wrapper for all REST API endpoints. Reads auth token from localStorage.

```typescript
const API_BASE = '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('vibecoding_token') || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function fetchRepos() { ... }
export async function createTask(repoId: string, data: CreateTaskRequest) { ... }
export async function fetchTasks(repoId: string, status?: string) { ... }
export async function fetchTaskDetail(taskId: string) { ... }
export async function cancelTask(taskId: string) { ... }
export async function deleteTask(taskId: string) { ... }
export async function bulkDeleteTasks(repoId: string, status: string) { ... }
export async function answerInteraction(interactionId: string, answer: string) { ... }
```

**Step 2: Create app-store.ts**

Zustand store holding:
- `repos`, `selectedRepoId`
- `tasks` (grouped by status)
- `selectedTaskId`, `taskDetail`
- `pendingInteractions`
- Actions: `fetchRepos`, `selectRepo`, `fetchTasks`, `createTask`, `cancelTask`, etc.

**Step 3: Create useWebSocket.ts**

Custom hook that establishes WebSocket connection, handles reconnection, parses events, and updates the store.

**Step 4: Commit**

```bash
git commit -am "feat(v2/web): add API client, Zustand store, and WebSocket hook"
```

---

## Task 19: Frontend - Auth Screen

**Files:**
- Create: `vibecoding-v2/packages/web/src/components/AuthScreen.tsx`
- Modify: `vibecoding-v2/packages/web/src/App.tsx`

**Step 1: Create AuthScreen**

Simple token input form. On submit, store token in localStorage and attempt API call to validate.

**Step 2: Update App.tsx**

If no valid token, show AuthScreen. Otherwise show Dashboard.

**Step 3: Commit**

```bash
git commit -am "feat(v2/web): add token auth screen"
```

---

## Task 20: Frontend - Dashboard Layout and RepoSelector

**Files:**
- Create: `vibecoding-v2/packages/web/src/pages/Dashboard.tsx`
- Create: `vibecoding-v2/packages/web/src/components/RepoSelector.tsx`
- Create: `vibecoding-v2/packages/web/src/components/Header.tsx`

**Step 1: Create Header with RepoSelector dropdown**

**Step 2: Create Dashboard layout with tab bar placeholder**

**Step 3: Commit**

```bash
git commit -am "feat(v2/web): add dashboard layout and repo selector"
```

---

## Task 21: Frontend - TaskList Component

**Files:**
- Create: `vibecoding-v2/packages/web/src/components/TaskList.tsx`
- Create: `vibecoding-v2/packages/web/src/components/TaskCard.tsx`

**Step 1: Create TaskList with status tabs**

Tabs: 待运行 (PENDING+QUEUED), 运行中 (RUNNING), 待确认 (AWAITING_INPUT), 已完成 (COMPLETED), 失败 (FAILED), 已取消 (CANCELLED).

Each tab shows count badge. Below tabs: list of TaskCard components.

Bottom: bulk action buttons (清空已完成, 清空失败, 清空已取消).

**Step 2: Create TaskCard**

Shows: title/prompt preview, status badge, creation time, action buttons (cancel/delete/view detail).

**Step 3: Commit**

```bash
git commit -am "feat(v2/web): add task list with status tabs and task cards"
```

---

## Task 22: Frontend - TaskForm Component

**Files:**
- Create: `vibecoding-v2/packages/web/src/components/TaskForm.tsx`

**Step 1: Create TaskForm**

Form fields:
- Prompt (textarea, required)
- Title (text input, optional, placeholder: "留空则自动截取 prompt 前 50 字符")
- Thinking mode (toggle switch)
- Predecessor task (multi-select dropdown, shows terminal tasks in current repo)
- Submit button

On submit: call `createTask()`, close form, refresh task list.

**Step 2: Commit**

```bash
git commit -am "feat(v2/web): add task creation form"
```

---

## Task 23: Frontend - TaskDetail Component

**Files:**
- Create: `vibecoding-v2/packages/web/src/components/TaskDetail.tsx`
- Create: `vibecoding-v2/packages/web/src/components/LogViewer.tsx`

**Step 1: Create TaskDetail**

Side panel or modal showing:
- Task info (title, prompt, status, created/started/completed time, cost, branch name)
- Error message (if failed)
- LogViewer with real-time streaming via WebSocket
- User interaction section (if AWAITING_INPUT)

**Step 2: Create LogViewer**

Scrollable log view with auto-scroll. Color-coded by log level. Receives logs from store (populated by WebSocket).

**Step 3: Commit**

```bash
git commit -am "feat(v2/web): add task detail panel with real-time log viewer"
```

---

## Task 24: Frontend - UserConfirm Component

**Files:**
- Create: `vibecoding-v2/packages/web/src/components/UserConfirm.tsx`

**Step 1: Create UserConfirm**

When a task is in AWAITING_INPUT, display:
- The question from CC
- Option buttons (if options provided)
- Free text input (always available)
- Submit button

On submit: call `answerInteraction()`.

Display as a prominent notification/banner for tasks awaiting input.

**Step 2: Commit**

```bash
git commit -am "feat(v2/web): add user confirmation UI for CC interactions"
```

---

## Task 25: Frontend - ConfigPanel

**Files:**
- Create: `vibecoding-v2/packages/web/src/components/ConfigPanel.tsx`

**Step 1: Create ConfigPanel**

Display current configuration. Allow adding/editing repos inline. Show:
- Global settings (max concurrency)
- Repo list with edit/delete
- Add repo form

**Step 2: Commit**

```bash
git commit -am "feat(v2/web): add configuration panel"
```

---

## Task 26: Frontend Build and Server Static Serving

**Files:**
- Modify: `vibecoding-v2/packages/server/src/server.ts`
- Modify: `vibecoding-v2/packages/web/vite.config.ts`

**Step 1: Configure Vite build output to `../../packages/server/public`**

Or alternatively, use `@fastify/static` to serve the built frontend from `packages/web/dist`.

**Step 2: Add static file serving to server.ts**

In production, serve `packages/web/dist` as static files. Fallback to `index.html` for SPA routing.

**Step 3: Build and test**

```bash
cd vibecoding-v2 && pnpm --filter @vibecoding/web build
pnpm --filter @vibecoding/server dev
# Open browser to localhost:8420, should see frontend
```

**Step 4: Commit**

```bash
git commit -am "feat(v2): serve frontend static files from backend in production"
```

---

## Task 27: Integration Test - End to End

**Files:**
- Create: `vibecoding-v2/packages/server/src/services/__tests__/integration.test.ts`

**Step 1: Set up integration test**

Use VibeTest repo (`~/VibeTest`) as the target. Create a simple task like "创建一个 hello.txt 文件，内容为 Hello World". Verify:
1. Task transitions through states: QUEUED → RUNNING → COMPLETED
2. Docker container is created and removed
3. The file exists in the repo after completion
4. A new commit was made
5. Worktree was cleaned up

**Step 2: Run the test**

This requires Docker and the worker image to be built. May need to be run manually rather than in CI.

```bash
cd vibecoding-v2 && pnpm --filter @vibecoding/server test -- --grep integration
```

**Step 3: Commit**

```bash
git commit -am "test(v2): add end-to-end integration test"
```

---

## Task 28: Polish and Documentation

**Files:**
- Modify: `vibecoding-v2/packages/server/src/index.ts` (graceful shutdown)
- Create: `vibecoding-v2/README.md`

**Step 1: Add graceful shutdown**

Handle SIGTERM/SIGINT: stop scheduler, wait for running tasks to finish (with timeout), close DB, exit.

**Step 2: Create README with setup instructions**

Covering:
1. Prerequisites (Node 22+, pnpm, Docker)
2. Installation (`pnpm install`)
3. Configuration (copy config.example.yaml)
4. Build Docker worker image
5. Start server (`pnpm dev` or `pnpm start`)
6. Access Web UI

**Step 3: Final commit**

```bash
git commit -am "docs(v2): add README and graceful shutdown"
```

---

Plan complete and saved to `docs/plans/2026-02-28-orchestration-center-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
