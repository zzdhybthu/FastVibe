import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db/index.js';
import { eventBus } from '../ws/event-bus.js';

const answerSchema = z.object({
  answer: z.string().min(1),
});

export async function interactionRoutes(app: FastifyInstance) {
  // POST /api/interactions/:id/answer — answer a pending interaction
  app.post<{ Params: { id: string } }>(
    '/api/interactions/:id/answer',
    async (request, reply) => {
      const db = getDb();
      const { id } = request.params;

      let body: z.infer<typeof answerSchema>;
      try {
        body = answerSchema.parse(request.body);
      } catch (err) {
        return reply.code(400).send({ error: 'Validation failed', details: (err as z.ZodError).errors });
      }

      // Find the interaction
      const rows = await db
        .select()
        .from(schema.taskInteractions)
        .where(eq(schema.taskInteractions.id, id));

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Interaction not found' });
      }

      const interaction = rows[0];
      if (interaction.status !== 'pending') {
        return reply.code(400).send({
          error: `Interaction is not pending. Current status: '${interaction.status}'`,
        });
      }

      const now = new Date().toISOString();
      await db
        .update(schema.taskInteractions)
        .set({
          answerData: JSON.stringify(body.answer),
          status: 'answered',
          answeredAt: now,
        })
        .where(eq(schema.taskInteractions.id, id));

      // Notify event bus so the task runner can resume
      eventBus.emit('interaction:answered', id, body.answer);

      // Return updated interaction
      const updated = await db
        .select()
        .from(schema.taskInteractions)
        .where(eq(schema.taskInteractions.id, id));

      return reply.send(updated[0]);
    },
  );
}
