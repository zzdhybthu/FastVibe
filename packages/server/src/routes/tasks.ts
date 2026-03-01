import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppConfig, TaskStatus } from '@vibecoding/shared';
import { getDb, schema } from '../db/index.js';
import { getTaskQueue } from '../services/task-queue.js';
import { getAbortController } from '../services/task-runner.js';

const execFileAsync = promisify(execFile);

const TERMINAL_STATUSES: TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];
const CANCELLABLE_STATUSES: TaskStatus[] = ['PENDING', 'QUEUED', 'RUNNING', 'AWAITING_INPUT'];

/**
 * Clean up git worktree and branch for a task.
 * Silently ignores errors (worktree/branch may already be cleaned up).
 */
async function cleanupTaskGitResources(repoPath: string, branchName: string | null) {
  if (!branchName) return;

  const worktreeDir = `.claude-worktrees/${branchName}`;

  // Force remove worktree (if exists)
  try {
    await execFileAsync('git', ['worktree', 'remove', worktreeDir, '--force'], { cwd: repoPath });
  } catch {
    // worktree may not exist or already removed
  }

  // Prune stale worktree entries
  try {
    await execFileAsync('git', ['worktree', 'prune'], { cwd: repoPath });
  } catch {
    // ignore
  }

  // Force delete branch (if exists)
  try {
    await execFileAsync('git', ['branch', '-D', branchName], { cwd: repoPath });
  } catch {
    // branch may not exist or already deleted
  }
}

const createTaskSchema = z.object({
  prompt: z.string().min(1),
  title: z.string().optional(),
  thinkingEnabled: z.boolean().default(false),
  predecessorTaskId: z.string().optional(),
  model: z.string().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  interactionTimeout: z.number().int().positive().optional(),
});

export async function taskRoutes(app: FastifyInstance, config: AppConfig) {
  // GET /api/repos/:repoId/tasks — list tasks for a repo
  app.get<{ Params: { repoId: string }; Querystring: { status?: string } }>(
    '/api/repos/:repoId/tasks',
    async (request, reply) => {
      const db = getDb();
      const { repoId } = request.params;
      const statusFilter = request.query.status;

      let query = db.select().from(schema.tasks).where(eq(schema.tasks.repoId, repoId));

      if (statusFilter) {
        const statuses = statusFilter.split(',').map((s) => s.trim()) as TaskStatus[];
        query = db
          .select()
          .from(schema.tasks)
          .where(and(eq(schema.tasks.repoId, repoId), inArray(schema.tasks.status, statuses)));
      }

      const result = await query;
      return reply.send(result);
    },
  );

  // POST /api/repos/:repoId/tasks — create task
  app.post<{ Params: { repoId: string } }>(
    '/api/repos/:repoId/tasks',
    async (request, reply) => {
      const db = getDb();
      const { repoId } = request.params;

      // Verify repo exists
      const repo = await db.select().from(schema.repos).where(eq(schema.repos.id, repoId));
      if (repo.length === 0) {
        return reply.code(404).send({ error: 'Repo not found' });
      }

      let body: z.infer<typeof createTaskSchema>;
      try {
        body = createTaskSchema.parse(request.body);
      } catch (err) {
        return reply.code(400).send({ error: 'Validation failed', details: (err as z.ZodError).errors });
      }

      // Auto-generate title from prompt if not provided
      const title = body.title || body.prompt.slice(0, 50) + (body.prompt.length > 50 ? '...' : '');

      // Always start as PENDING; enqueue() will transition to QUEUED if appropriate
      const newTask = {
        id: uuid(),
        repoId,
        title,
        prompt: body.prompt,
        status: 'PENDING' as TaskStatus,
        thinkingEnabled: body.thinkingEnabled,
        predecessorTaskId: body.predecessorTaskId ?? null,
        model: body.model ?? config.claude.model[0],
        maxBudgetUsd: body.maxBudgetUsd ?? config.claude.maxBudgetUsd,
        interactionTimeout: body.interactionTimeout ?? config.claude.interactionTimeout,
        branchName: null,
        worktreePath: null,
        sessionId: null,
        result: null,
        errorMessage: null,
        costUsd: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
      };

      await db.insert(schema.tasks).values(newTask);

      // Enqueue the task (transitions PENDING->QUEUED if predecessor is done, triggers scheduler)
      await getTaskQueue().enqueue(newTask.id);

      // Re-read to get updated status after enqueue
      const inserted = await db.select().from(schema.tasks).where(eq(schema.tasks.id, newTask.id));
      return reply.code(201).send(inserted[0] ?? newTask);
    },
  );

  // GET /api/tasks/:id — task detail with recent logs and pending interactions
  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const taskRows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    if (taskRows.length === 0) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const task = taskRows[0];

    // Get recent logs (last 100)
    const logs = await db
      .select()
      .from(schema.taskLogs)
      .where(eq(schema.taskLogs.taskId, id))
      .orderBy(desc(schema.taskLogs.id))
      .limit(100);

    // Get all interactions for this task
    const interactions = await db
      .select()
      .from(schema.taskInteractions)
      .where(eq(schema.taskInteractions.taskId, id));

    return reply.send({ ...task, logs: logs.reverse(), interactions });
  });

  // POST /api/tasks/:id/cancel — cancel task
  app.post<{ Params: { id: string } }>('/api/tasks/:id/cancel', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const taskRows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    if (taskRows.length === 0) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const task = taskRows[0];

    // Idempotent: if already in terminal status, return current state
    if (TERMINAL_STATUSES.includes(task.status as TaskStatus)) {
      return reply.send(task);
    }

    if (!CANCELLABLE_STATUSES.includes(task.status as TaskStatus)) {
      return reply.code(400).send({
        error: `Cannot cancel task in status '${task.status}'. Must be one of: ${CANCELLABLE_STATUSES.join(', ')}`,
      });
    }

    // Use TaskQueueService to cancel (handles status update + event emission)
    const { wasRunning } = await getTaskQueue().cancelTask(id);

    // If task was running, abort the SDK process
    if (wasRunning) {
      const abortController = getAbortController(id);
      if (abortController) {
        abortController.abort();
      }
    }

    const updated = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return reply.send(updated[0]);
  });

  // DELETE /api/tasks/:id — delete task (only terminal status)
  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const taskRows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    if (taskRows.length === 0) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const task = taskRows[0];
    if (!TERMINAL_STATUSES.includes(task.status as TaskStatus)) {
      return reply.code(400).send({
        error: `Cannot delete task in status '${task.status}'. Must be in a terminal status: ${TERMINAL_STATUSES.join(', ')}`,
      });
    }

    // Cascade delete: logs, interactions, then task
    await db.delete(schema.taskLogs).where(eq(schema.taskLogs.taskId, id));
    await db.delete(schema.taskInteractions).where(eq(schema.taskInteractions.taskId, id));
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));

    // Clean up worktree and branch
    const repo = await db.select().from(schema.repos).where(eq(schema.repos.id, task.repoId));
    if (repo.length > 0) {
      await cleanupTaskGitResources(repo[0].path, task.branchName);
    }

    return reply.code(204).send();
  });

  // DELETE /api/repos/:repoId/tasks/bulk — bulk delete terminal tasks
  app.delete<{ Params: { repoId: string }; Querystring: { status?: string } }>(
    '/api/repos/:repoId/tasks/bulk',
    async (request, reply) => {
      const db = getDb();
      const { repoId } = request.params;
      const statusParam = request.query.status;

      if (!statusParam) {
        return reply.code(400).send({
          error: 'Query parameter "status" is required. Must be one of: COMPLETED, FAILED, CANCELLED',
        });
      }

      const status = statusParam.trim() as TaskStatus;
      if (!TERMINAL_STATUSES.includes(status)) {
        return reply.code(400).send({
          error: `Status must be a terminal status: ${TERMINAL_STATUSES.join(', ')}`,
        });
      }

      // Find all matching tasks (need branchName for cleanup)
      const tasksToDelete = await db
        .select({ id: schema.tasks.id, branchName: schema.tasks.branchName })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.repoId, repoId), eq(schema.tasks.status, status)));

      if (tasksToDelete.length === 0) {
        return reply.send({ deleted: 0 });
      }

      const taskIds = tasksToDelete.map((t) => t.id);

      // Cascade delete: logs, interactions, then tasks
      await db.delete(schema.taskLogs).where(inArray(schema.taskLogs.taskId, taskIds));
      await db.delete(schema.taskInteractions).where(inArray(schema.taskInteractions.taskId, taskIds));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));

      // Clean up worktrees and branches
      const repo = await db.select().from(schema.repos).where(eq(schema.repos.id, repoId));
      if (repo.length > 0) {
        await Promise.all(
          tasksToDelete.map((t) => cleanupTaskGitResources(repo[0].path, t.branchName)),
        );
      }

      return reply.send({ deleted: taskIds.length });
    },
  );
}
