import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';
import type { AppConfig, WsServerEvent, TaskStatus } from '@vibecoding/shared';

/**
 * Creates an in-process MCP server with the `ask_user` tool.
 * This tool allows Claude (running inside a task) to ask the user a question
 * and wait for the answer via the WebSocket-connected frontend.
 */
export function createUserInteractionServer(taskId: string, repoId: string, config: AppConfig) {
  return createSdkMcpServer({
    name: 'user-interaction',
    tools: [
      tool(
        'ask_user',
        '向用户提问并等待回答。当你需要用户确认或选择时使用此工具。',
        {
          question: z.string(),
          options: z.array(z.string()).optional(),
        },
        async (args) => {
          const db = getDb();
          const interactionId = uuidv4();
          const now = new Date().toISOString();

          // 1. Create interaction record in DB
          const questionData = JSON.stringify({
            question: args.question,
            options: args.options,
          });

          await db.insert(schema.taskInteractions).values({
            id: interactionId,
            taskId,
            questionData,
            status: 'pending',
            createdAt: now,
          });

          // 2. Update task status to AWAITING_INPUT
          await db
            .update(schema.tasks)
            .set({ status: 'AWAITING_INPUT' as TaskStatus })
            .where(eq(schema.tasks.id, taskId));

          // 3. Broadcast interaction event
          const interactionEvent: WsServerEvent = {
            type: 'task:interaction',
            taskId,
            interactionId,
            questionData: { question: args.question, options: args.options },
          };
          eventBus.emit('ws:broadcast', interactionEvent);

          // 4. Broadcast task status change
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

          // 5. Wait for answer via eventBus with timeout
          const timeoutMs = (config.claude.interactionTimeout || 1800) * 1000;

          const answer = await new Promise<string>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | null = null;

            const onAnswer = (answeredId: string, answerText: string) => {
              if (answeredId !== interactionId) return;

              // Clean up
              eventBus.off('interaction:answered', onAnswer);
              if (timer) clearTimeout(timer);

              resolve(answerText);
            };

            eventBus.on('interaction:answered', onAnswer);

            // Timeout
            timer = setTimeout(() => {
              eventBus.off('interaction:answered', onAnswer);

              // Update interaction status to timeout
              db.update(schema.taskInteractions)
                .set({ status: 'timeout' })
                .where(eq(schema.taskInteractions.id, interactionId))
                .then(() => {})
                .catch(() => {});

              reject(new Error('User interaction timeout'));
            }, timeoutMs);
          });

          // 6. Update DB with answer
          await db
            .update(schema.taskInteractions)
            .set({
              answerData: JSON.stringify({ answer }),
              status: 'answered',
              answeredAt: new Date().toISOString(),
            })
            .where(eq(schema.taskInteractions.id, interactionId));

          // 7. Set task back to RUNNING
          await db
            .update(schema.tasks)
            .set({ status: 'RUNNING' as TaskStatus })
            .where(eq(schema.tasks.id, taskId));

          // Broadcast status change back to RUNNING
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

          // 8. Return the answer to Claude
          return {
            content: [{ type: 'text' as const, text: answer }],
          };
        },
      ),
    ],
  });
}
