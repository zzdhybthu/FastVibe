import { eq } from 'drizzle-orm';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';
import { createUserInteractionServer } from './user-interaction.js';
import { buildPrompt, buildBranchName } from './prompt-builder.js';
import type { AppConfig, Task, Repo, TaskStatus, LogLevel, WsServerEvent } from '@vibecoding/shared';

// Map of taskId -> AbortController for cancellation
const runningTasks = new Map<string, AbortController>();

/**
 * Get the AbortController for a running task.
 */
export function getAbortController(taskId: string): AbortController | undefined {
  return runningTasks.get(taskId);
}

/**
 * Log a message for a task — inserts into task_logs and broadcasts via eventBus.
 */
async function logTask(taskId: string, level: LogLevel, message: string): Promise<void> {
  const db = getDb();
  const timestamp = new Date().toISOString();

  await db.insert(schema.taskLogs).values({
    taskId,
    level,
    message,
    timestamp,
  });

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
 * Broadcast a task status change via eventBus.
 */
async function broadcastTaskStatus(taskId: string, repoId: string, status: TaskStatus): Promise<void> {
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

/**
 * Run a task using the Claude Agent SDK.
 * This is the main entry point for task execution.
 */
export async function runTask(task: Task, repo: Repo, config: AppConfig): Promise<void> {
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
    await logTask(task.id, 'info', `Task started. Branch: ${branchName}`);

    // 2. Create user interaction MCP server
    const mcpServer = createUserInteractionServer(task.id, repo.id, config);

    // 3. Build prompt
    const prompt = buildPrompt(task, repo);

    // 4. Call the SDK
    // Build env without CLAUDECODE to avoid nested-session detection
    const cleanEnv: Record<string, string | undefined> = { ...process.env };
    delete cleanEnv.CLAUDECODE;

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
          append: '你在自动化模式下运行。如果需要用户输入，使用 ask_user MCP 工具。',
        },
        tools: { type: 'preset', preset: 'claude_code' },
        thinking: task.thinkingEnabled
          ? { type: 'enabled', budgetTokens: 10000 }
          : { type: 'adaptive' },
        model: config.claude.model,
        maxBudgetUsd: config.claude.maxBudgetUsd,
        abortController,
        env: cleanEnv,
        mcpServers: {
          'user-interaction': mcpServer,
        },
      },
    });

    // 5. Stream and process SDK messages
    for await (const message of conversation) {
      if (abortController.signal.aborted) {
        break;
      }

      await processSDKMessage(task.id, repo.id, message);
    }

    // If we got here without abort, task succeeded
    // Check if the last result was already handled in processSDKMessage
    const finalTask = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, task.id),
    });
    if (finalTask && finalTask.status === 'RUNNING') {
      // No explicit result message was received, mark as completed
      await db
        .update(schema.tasks)
        .set({
          status: 'COMPLETED' as TaskStatus,
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.tasks.id, task.id));

      await broadcastTaskStatus(task.id, repo.id, 'COMPLETED');
      await logTask(task.id, 'info', 'Task completed');
      eventBus.emit('task:completed', task.id);
    }
  } catch (err: any) {
    // Check if this was a cancellation
    if (abortController.signal.aborted) {
      await logTask(task.id, 'info', 'Task was cancelled');
      // Status already set to CANCELLED by cancelTask
      return;
    }

    // Mark as FAILED
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

/**
 * Process a single SDK message from the conversation stream.
 */
async function processSDKMessage(taskId: string, repoId: string, message: SDKMessage): Promise<void> {
  const db = getDb();

  switch (message.type) {
    case 'assistant': {
      // Extract text content from the assistant message
      const textBlocks = message.message.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text);

      if (textBlocks.length > 0) {
        const text = textBlocks.join('\n');
        // Truncate very long messages for the log
        const logText = text.length > 2000 ? text.slice(0, 2000) + '... (truncated)' : text;
        await logTask(taskId, 'info', logText);
      }
      break;
    }

    case 'result': {
      if (message.subtype === 'success') {
        // Task completed successfully
        await db
          .update(schema.tasks)
          .set({
            status: 'COMPLETED' as TaskStatus,
            result: message.result,
            costUsd: message.total_cost_usd,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.tasks.id, taskId));

        await broadcastTaskStatus(taskId, repoId, 'COMPLETED');
        await logTask(taskId, 'info', `Task completed. Cost: $${message.total_cost_usd.toFixed(4)}, Turns: ${message.num_turns}`);
        eventBus.emit('task:completed', taskId);
      } else {
        // Error result
        const errorMsg = 'errors' in message && Array.isArray(message.errors)
          ? message.errors.join('; ')
          : `SDK error: ${message.subtype}`;

        await db
          .update(schema.tasks)
          .set({
            status: 'FAILED' as TaskStatus,
            errorMessage: errorMsg,
            costUsd: message.total_cost_usd,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.tasks.id, taskId));

        await broadcastTaskStatus(taskId, repoId, 'FAILED');
        await logTask(taskId, 'error', `Task failed: ${errorMsg}`);
        eventBus.emit('task:failed', taskId);
      }
      break;
    }

    case 'system': {
      if (message.subtype === 'init') {
        await logTask(taskId, 'debug', `SDK initialized. Model: ${message.model}, Tools: ${message.tools.length}`);
      }
      break;
    }

    default: {
      // Other message types (stream_event, status, etc.) — ignore for now
      break;
    }
  }
}
