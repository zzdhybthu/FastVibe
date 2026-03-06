import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';
import { buildBranchName } from './prompt-builder.js';
import { logTask, broadcastTaskStatus } from './runners/types.js';
import { claudeRunner } from './runners/claude-runner.js';
import { codexRunner } from './runners/codex-runner.js';
import type { Task, Repo, TaskStatus } from '@fastvibe/shared';

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

    const agentType = task.agentType ?? 'claude-code';
    const runner = runners[agentType as keyof typeof runners];
    if (!runner) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    const ctx = {
      task,
      repo,
      abortController,
      logTask: (level: any, message: string) => logTask(task.id, level, message),
      broadcastStatus: (status: TaskStatus) => broadcastTaskStatus(task.id, repo.id, status),
    };

    const { result, costUsd } = await runner.run(ctx);

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
