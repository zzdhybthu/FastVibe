import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';
import type { WsServerEvent, TaskStatus } from '@fastvibe/shared';

/**
 * Create interaction records, broadcast them, wait for user answers, and return them.
 * Shared by both the MCP tool handler (Claude) and the Codex runner.
 */
export async function createAndWaitForInteraction(params: {
  taskId: string;
  repoId: string;
  questions: { question: string; options?: string[] }[];
  interactionTimeout: number;
  abortSignal?: AbortSignal;
}): Promise<string[]> {
  const { taskId, repoId, questions, interactionTimeout, abortSignal } = params;
  const db = getDb();
  const now = new Date().toISOString();
  const interactions: { id: string; question: string; options?: string[] }[] = [];

  // 1. Create all interaction records and broadcast them
  for (const q of questions) {
    const interactionId = uuidv4();
    const questionData = JSON.stringify({
      question: q.question,
      options: q.options,
    });

    await db.insert(schema.taskInteractions).values({
      id: interactionId,
      taskId,
      questionData,
      status: 'pending',
      createdAt: now,
    });

    interactions.push({ id: interactionId, question: q.question, options: q.options });

    const interactionEvent: WsServerEvent = {
      type: 'task:interaction',
      taskId,
      interactionId,
      questionData: { question: q.question, options: q.options },
    };
    eventBus.emit('ws:broadcast', interactionEvent);
  }

  // 2. Update task status to AWAITING_INPUT
  await db
    .update(schema.tasks)
    .set({ status: 'AWAITING_INPUT' as TaskStatus })
    .where(eq(schema.tasks.id, taskId));

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (task) {
    const statusEvent: WsServerEvent = {
      type: 'task:status',
      taskId,
      repoId,
      status: 'AWAITING_INPUT',
      task: task as any,
    };
    eventBus.emit('ws:broadcast', statusEvent);
  }

  // 3. Wait for ALL answers via eventBus with timeout
  // Cap at 2^31-1 ms (~24.8 days) to avoid setTimeout overflow
  const MAX_TIMEOUT_MS = 2_147_483_647;
  const timeoutMs = Math.min((interactionTimeout || 1800) * 1000, MAX_TIMEOUT_MS);
  const interactionIds = new Set(interactions.map((i) => i.id));
  const answers = new Map<string, string>();

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      eventBus.off('interaction:answered', onAnswer);
      if (timer) clearTimeout(timer);
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
    };

    const onAnswer = (answeredId: string, answerText: string) => {
      if (!interactionIds.has(answeredId)) return;
      answers.set(answeredId, answerText);

      if (answers.size === interactions.length) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const onAbort = () => {
      cleanup();
      for (const interaction of interactions) {
        if (!answers.has(interaction.id)) {
          db.update(schema.taskInteractions)
            .set({ status: 'timeout' })
            .where(eq(schema.taskInteractions.id, interaction.id))
            .then(() => {})
            .catch(() => {});
        }
      }
    };

    eventBus.on('interaction:answered', onAnswer);

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      abortSignal.addEventListener('abort', onAbort);
    }

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();

      for (const interaction of interactions) {
        if (!answers.has(interaction.id)) {
          db.update(schema.taskInteractions)
            .set({ status: 'timeout' })
            .where(eq(schema.taskInteractions.id, interaction.id))
            .then(() => {})
            .catch(() => {});
        }
      }

      reject(new Error('User interaction timeout'));
    }, timeoutMs);
  });

  // 4. Set task back to RUNNING
  await db
    .update(schema.tasks)
    .set({ status: 'RUNNING' as TaskStatus })
    .where(eq(schema.tasks.id, taskId));

  const updatedTask = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (updatedTask) {
    const statusEvent: WsServerEvent = {
      type: 'task:status',
      taskId,
      repoId,
      status: 'RUNNING',
      task: updatedTask as any,
    };
    eventBus.emit('ws:broadcast', statusEvent);
  }

  // 5. Return answers in order
  return interactions.map((interaction) => answers.get(interaction.id)!);
}

/**
 * Creates an in-process MCP server with the `ask_user` tool.
 * This tool allows Claude (running inside a task) to ask the user one or more
 * questions and wait for all answers via the WebSocket-connected frontend.
 */
export function createUserInteractionServer(taskId: string, repoId: string, interactionTimeout: number, language: 'zh' | 'en', abortSignal?: AbortSignal) {
  const toolDescription = language === 'en'
    ? 'Ask the user a question and wait for a response. Use this tool when you need user confirmation or a choice. Ask multiple questions at once when possible.'
    : '向用户提问并等待回答。当你需要用户确认或选择时使用此工具。有多个问题时应一次性提出。';

  return createSdkMcpServer({
    name: 'user-interaction',
    tools: [
      tool(
        'ask_user',
        toolDescription,
        {
          questions: z.array(
            z.object({
              question: z.string(),
              options: z.array(z.string()).optional(),
            }),
          ).min(1),
        },
        async (args) => {
          const answers = await createAndWaitForInteraction({
            taskId,
            repoId,
            questions: args.questions,
            interactionTimeout,
            abortSignal,
          });

          const resultParts = args.questions.map((q, i) => `Q: ${q.question}\nA: ${answers[i]}`);

          return {
            content: [{ type: 'text' as const, text: resultParts.join('\n\n') }],
          };
        },
      ),
    ],
  });
}
