import type { Task, Repo, LogLevel, TaskStatus, WsServerEvent } from '@fastvibe/shared';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db/index.js';
import { eventBus } from '../../ws/event-bus.js';

export interface RunContext {
  task: Task;
  repo: Repo;
  abortController: AbortController;
  logTask: (level: LogLevel, message: string) => Promise<void>;
  broadcastStatus: (status: TaskStatus) => Promise<void>;
}

export interface AgentRunner {
  run(ctx: RunContext): Promise<{ result?: string; costUsd?: number }>;
}

export async function logTask(taskId: string, level: LogLevel, message: string): Promise<void> {
  const db = getDb();
  const timestamp = new Date().toISOString();
  await db.insert(schema.taskLogs).values({ taskId, level, message, timestamp });
  const event: WsServerEvent = { type: 'task:log', taskId, level, message, timestamp };
  eventBus.emit('ws:broadcast', event);
}

export async function broadcastTaskStatus(taskId: string, repoId: string, status: TaskStatus): Promise<void> {
  const db = getDb();
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  if (!task) return;
  const event: WsServerEvent = { type: 'task:status', taskId, repoId, status, task: task as Task };
  eventBus.emit('ws:broadcast', event);
}
