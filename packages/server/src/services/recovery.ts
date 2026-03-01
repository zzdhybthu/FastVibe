import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { isContainerRunning, removeContainer, cleanupOrphanContainers } from './docker.js';
import type { AppConfig, TaskStatus } from '@vibecoding/shared';

/**
 * Recover from a previous crash / restart.
 * 1. Mark stuck RUNNING/AWAITING_INPUT tasks as FAILED
 * 2. Clean up orphan Docker containers
 * 3. Unblock PENDING tasks whose predecessors are now terminal
 */
export async function recoverOnStartup(_config: AppConfig): Promise<void> {
  const db = getDb();
  const TERMINAL_STATUSES: TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

  // 1. Find tasks stuck in RUNNING or AWAITING_INPUT
  const stuckTasks = await db
    .select()
    .from(schema.tasks)
    .where(inArray(schema.tasks.status, ['RUNNING', 'AWAITING_INPUT']));

  for (const task of stuckTasks) {
    // Check if Docker container still exists
    if (task.dockerContainerId) {
      const running = await isContainerRunning(task.dockerContainerId);
      if (!running) {
        // Container gone — mark failed
        await db
          .update(schema.tasks)
          .set({
            status: 'FAILED' as TaskStatus,
            errorMessage: 'Service restarted, task interrupted (container not found)',
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.tasks.id, task.id));
      } else {
        // Container exists but we lost the SDK connection — stop and fail
        await removeContainer(task.dockerContainerId);
        await db
          .update(schema.tasks)
          .set({
            status: 'FAILED' as TaskStatus,
            errorMessage: 'Service restarted, task interrupted (connection lost)',
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.tasks.id, task.id));
      }
    } else {
      // No container ID — just mark failed
      await db
        .update(schema.tasks)
        .set({
          status: 'FAILED' as TaskStatus,
          errorMessage: 'Service restarted, task interrupted',
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.tasks.id, task.id));
    }
  }

  // 2. Clean up orphan containers
  const cleanedCount = await cleanupOrphanContainers();
  if (cleanedCount > 0) {
    console.log(`[recovery] Cleaned up ${cleanedCount} orphan containers`);
  }

  // 3. Check if any PENDING tasks should be unblocked
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
      if (!pred || TERMINAL_STATUSES.includes(pred.status as TaskStatus)) {
        await db
          .update(schema.tasks)
          .set({ status: 'QUEUED' as TaskStatus })
          .where(eq(schema.tasks.id, task.id));
      }
    }
  }

  console.log(`[recovery] Recovery complete: ${stuckTasks.length} stuck tasks handled`);
}
