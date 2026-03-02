import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';
import type { WsServerEvent, TaskStatus } from '@vibecoding/shared';

/**
 * Creates an in-process MCP server with the `ask_user` tool.
 * This tool allows Claude (running inside a task) to ask the user one or more
 * questions and wait for all answers via the WebSocket-connected frontend.
 */
export function createUserInteractionServer(taskId: string, repoId: string, interactionTimeout: number) {
  return createSdkMcpServer({
    name: 'user-interaction',
    tools: [
      tool(
        'ask_user',
        '向用户提问并等待回答。当你需要用户确认或选择时使用此工具。有多个问题时应一次性提出。',
        {
          questions: z.array(
            z.object({
              question: z.string(),
              options: z.array(z.string()).optional(),
            }),
          ).min(1),
        },
        async (args) => {
          const db = getDb();
          const now = new Date().toISOString();
          const interactions: { id: string; question: string; options?: string[] }[] = [];

          // 1. Create all interaction records and broadcast them
          for (const q of args.questions) {
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

            // Broadcast each interaction event
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
          const timeoutMs = (interactionTimeout || 1800) * 1000;
          const interactionIds = new Set(interactions.map((i) => i.id));
          const answers = new Map<string, string>();

          await new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | null = null;

            const onAnswer = (answeredId: string, answerText: string) => {
              if (!interactionIds.has(answeredId)) return;
              answers.set(answeredId, answerText);

              if (answers.size === interactions.length) {
                eventBus.off('interaction:answered', onAnswer);
                if (timer) clearTimeout(timer);
                resolve();
              }
            };

            eventBus.on('interaction:answered', onAnswer);

            timer = setTimeout(() => {
              eventBus.off('interaction:answered', onAnswer);

              // Mark unanswered interactions as timeout
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
          // (individual interaction DB records already updated by the REST endpoint)
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

          // 5. Return all answers to Claude
          const resultParts = interactions.map((interaction) => {
            const answer = answers.get(interaction.id)!;
            return `Q: ${interaction.question}\nA: ${answer}`;
          });

          return {
            content: [{ type: 'text' as const, text: resultParts.join('\n\n') }],
          };
        },
      ),
    ],
  });
}
