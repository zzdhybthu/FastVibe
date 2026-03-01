import { eq, and, inArray, count } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';
import type { AppConfig, Task, TaskStatus, WsServerEvent } from '@vibecoding/shared';

const TERMINAL_STATUSES: TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export class TaskQueueService {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Called when a task is created via API.
   * Checks predecessor: if predecessor exists and is not terminal, status stays PENDING.
   * Otherwise transitions to QUEUED.
   * Emits event to trigger scheduler.
   */
  async enqueue(taskId: string): Promise<void> {
    const db = getDb();

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Check if task has a predecessor
    if (task.predecessorTaskId) {
      const predecessor = await db.query.tasks.findFirst({
        where: eq(schema.tasks.id, task.predecessorTaskId),
      });

      if (predecessor && !TERMINAL_STATUSES.includes(predecessor.status as TaskStatus)) {
        // Predecessor still running — task stays PENDING until predecessor finishes
        return;
      }

      // Predecessor is terminal — check if it succeeded
      if (predecessor && predecessor.status !== 'COMPLETED') {
        // Predecessor failed or was cancelled — cancel this task too
        const reason = `前置任务 ${predecessor.title || task.predecessorTaskId} 状态为 ${predecessor.status}，自动取消`;
        await db
          .update(schema.tasks)
          .set({
            status: 'CANCELLED' as TaskStatus,
            errorMessage: reason,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.tasks.id, taskId));

        await this.broadcastTaskStatus(taskId, task.repoId, 'CANCELLED');
        eventBus.emit('task:cancelled', taskId);
        return;
      }
      // Predecessor completed (or deleted) — proceed to QUEUED
    }

    // Transition to QUEUED
    await db
      .update(schema.tasks)
      .set({ status: 'QUEUED' })
      .where(eq(schema.tasks.id, taskId));

    // Broadcast status change
    await this.broadcastTaskStatus(taskId, task.repoId, 'QUEUED');

    // Emit event to trigger scheduler
    eventBus.emit('schedule:check');
  }

  /**
   * Called periodically by scheduler. Returns tasks that should start running.
   * Checks: task is QUEUED, repo concurrency not exceeded, global concurrency not exceeded.
   */
  async getTasksToRun(): Promise<Array<{ task: Task; repo: (typeof schema.repos.$inferSelect) }>> {
    const db = getDb();

    // Get total running count
    const totalRunning = await this.getTotalRunningCount();
    if (totalRunning >= this.config.global.maxTotalConcurrency) {
      return [];
    }

    // Get all QUEUED tasks ordered by creation time
    const queuedTasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.status, 'QUEUED'),
      orderBy: (tasks, { asc }) => [asc(tasks.createdAt)],
    });

    if (queuedTasks.length === 0) {
      return [];
    }

    // Get running counts per repo
    const runningCounts = new Map<string, number>();
    const runningTasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.status, 'RUNNING'),
    });
    for (const t of runningTasks) {
      runningCounts.set(t.repoId, (runningCounts.get(t.repoId) ?? 0) + 1);
    }
    // Also count AWAITING_INPUT as running
    const awaitingTasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.status, 'AWAITING_INPUT'),
    });
    for (const t of awaitingTasks) {
      runningCounts.set(t.repoId, (runningCounts.get(t.repoId) ?? 0) + 1);
    }

    const result: Array<{ task: Task; repo: (typeof schema.repos.$inferSelect) }> = [];
    let currentTotal = totalRunning;

    for (const task of queuedTasks) {
      if (currentTotal >= this.config.global.maxTotalConcurrency) {
        break;
      }

      // Get repo for this task
      const repo = await db.query.repos.findFirst({
        where: eq(schema.repos.id, task.repoId),
      });
      if (!repo) {
        continue;
      }

      // Check repo concurrency
      const repoRunning = runningCounts.get(task.repoId) ?? 0;
      if (repoRunning >= repo.maxConcurrency) {
        continue;
      }

      result.push({ task: task as Task, repo });
      runningCounts.set(task.repoId, repoRunning + 1);
      currentTotal++;
    }

    return result;
  }

  /**
   * Called when a task finishes (any terminal status).
   * Checks if any PENDING tasks had this as predecessor.
   * If predecessor COMPLETED, transition dependent to QUEUED.
   * If predecessor FAILED/CANCELLED, cascade-cancel dependents.
   */
  async onTaskTerminated(taskId: string): Promise<void> {
    const db = getDb();

    const predecessor = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });
    if (!predecessor) return;

    // Find all PENDING tasks that have this task as predecessor
    const dependentTasks = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.predecessorTaskId, taskId),
        eq(schema.tasks.status, 'PENDING'),
      ),
    });

    for (const dependent of dependentTasks) {
      if (predecessor.status === 'COMPLETED') {
        // Predecessor succeeded — unblock dependent
        await db
          .update(schema.tasks)
          .set({ status: 'QUEUED' })
          .where(eq(schema.tasks.id, dependent.id));

        await this.broadcastTaskStatus(dependent.id, dependent.repoId, 'QUEUED');
      } else {
        // Predecessor failed or was cancelled — cascade cancel
        const reason = `前置任务 ${predecessor.title || taskId} 状态为 ${predecessor.status}，自动取消`;
        await db
          .update(schema.tasks)
          .set({
            status: 'CANCELLED' as TaskStatus,
            errorMessage: reason,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.tasks.id, dependent.id));

        await this.broadcastTaskStatus(dependent.id, dependent.repoId, 'CANCELLED');
        // Recursively cancel any tasks depending on this one
        eventBus.emit('task:cancelled', dependent.id);
      }
    }

    // Trigger scheduler to pick up newly queued tasks
    if (dependentTasks.length > 0) {
      eventBus.emit('schedule:check');
    }
  }

  /**
   * Cancel a task. If PENDING/QUEUED, just update status.
   * If RUNNING/AWAITING_INPUT, return wasRunning=true so caller can abort.
   */
  async cancelTask(taskId: string): Promise<{ wasRunning: boolean }> {
    const db = getDb();

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (TERMINAL_STATUSES.includes(task.status as TaskStatus)) {
      throw new Error(`Task ${taskId} is already in terminal status: ${task.status}`);
    }

    const wasRunning = task.status === 'RUNNING' || task.status === 'AWAITING_INPUT';

    // Update status to CANCELLED
    await db
      .update(schema.tasks)
      .set({
        status: 'CANCELLED',
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.tasks.id, taskId));

    // Broadcast status change
    await this.broadcastTaskStatus(taskId, task.repoId, 'CANCELLED');

    // Emit terminal event so dependents can be unblocked
    eventBus.emit('task:cancelled', taskId);

    return { wasRunning };
  }

  /**
   * Count running tasks per repo (RUNNING + AWAITING_INPUT).
   */
  async getRunningCount(repoId: string): Promise<number> {
    const db = getDb();

    const running = await db
      .select({ value: count() })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.repoId, repoId),
          inArray(schema.tasks.status, ['RUNNING', 'AWAITING_INPUT']),
        ),
      );

    return running[0]?.value ?? 0;
  }

  /**
   * Count total running tasks across all repos (RUNNING + AWAITING_INPUT).
   */
  async getTotalRunningCount(): Promise<number> {
    const db = getDb();

    const running = await db
      .select({ value: count() })
      .from(schema.tasks)
      .where(
        inArray(schema.tasks.status, ['RUNNING', 'AWAITING_INPUT']),
      );

    return running[0]?.value ?? 0;
  }

  /**
   * Broadcast task status change via eventBus.
   */
  private async broadcastTaskStatus(taskId: string, repoId: string, status: TaskStatus): Promise<void> {
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
}

// Singleton — will be initialized by the orchestrator with config
let _instance: TaskQueueService | null = null;

export function initTaskQueue(config: AppConfig): TaskQueueService {
  _instance = new TaskQueueService(config);

  // Listen for terminal events to unblock dependents
  eventBus.on('task:completed', (taskId: string) => {
    _instance?.onTaskTerminated(taskId).catch((err) => {
      console.error(`[task-queue] Error handling task:completed for ${taskId}:`, err);
    });
  });

  eventBus.on('task:failed', (taskId: string) => {
    _instance?.onTaskTerminated(taskId).catch((err) => {
      console.error(`[task-queue] Error handling task:failed for ${taskId}:`, err);
    });
  });

  eventBus.on('task:cancelled', (taskId: string) => {
    _instance?.onTaskTerminated(taskId).catch((err) => {
      console.error(`[task-queue] Error handling task:cancelled for ${taskId}:`, err);
    });
  });

  return _instance;
}

export function getTaskQueue(): TaskQueueService {
  if (!_instance) {
    throw new Error('TaskQueueService not initialized. Call initTaskQueue() first.');
  }
  return _instance;
}
