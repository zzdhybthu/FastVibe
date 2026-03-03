import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import type { TaskStatus } from '@vibecoding/shared';

/**
 * Recover from a previous crash / restart.
 * 1. Mark stuck RUNNING/AWAITING_INPUT tasks as FAILED
 * 2. Unblock PENDING tasks whose predecessors are now terminal
 */
export async function recoverOnStartup(): Promise<void> {
  const db = getDb();
  const TERMINAL_STATUSES: TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

  // 1. Find tasks stuck in RUNNING or AWAITING_INPUT and mark them FAILED
  const stuckTasks = await db
    .select()
    .from(schema.tasks)
    .where(inArray(schema.tasks.status, ['RUNNING', 'AWAITING_INPUT']));

  for (const task of stuckTasks) {
    await db
      .update(schema.tasks)
      .set({
        status: 'FAILED' as TaskStatus,
        errorMessage: 'Service restarted, task interrupted',
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.tasks.id, task.id));
  }

  // 2. Check if any PENDING tasks should be unblocked or cancelled
  // (their predecessors may have completed/failed while we were down)
  const pendingTasks = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.status, 'PENDING'));

  for (const task of pendingTasks) {
    if (task.predecessorTaskId) {
      const predRows = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, task.predecessorTaskId));

      const pred = predRows[0];
      if (!pred || pred.status === 'COMPLETED') {
        // Predecessor completed (or deleted) — unblock
        await db
          .update(schema.tasks)
          .set({ status: 'QUEUED' as TaskStatus })
          .where(eq(schema.tasks.id, task.id));
      } else if (TERMINAL_STATUSES.includes(pred.status as TaskStatus)) {
        // Predecessor failed or cancelled — cascade cancel
        const taskLang = (task.language ?? 'zh') as 'zh' | 'en';
        const predName = pred.title || task.predecessorTaskId;
        const reason = taskLang === 'en'
          ? `Predecessor task "${predName}" is ${pred.status}, auto-cancelled`
          : `前置任务「${predName}」状态为 ${pred.status}，自动取消`;
        await db
          .update(schema.tasks)
          .set({
            status: 'CANCELLED' as TaskStatus,
            errorMessage: reason,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.tasks.id, task.id));
      }
    }
  }

  console.log(`[recovery] Recovery complete: ${stuckTasks.length} stuck tasks handled`);
}
