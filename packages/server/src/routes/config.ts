import type { FastifyInstance } from 'fastify';
import type { AppConfig, ClaudeDefaults } from '@vibecoding/shared';

export async function configRoutes(app: FastifyInstance, config: AppConfig) {
  app.get('/api/config/claude-defaults', async (_request, reply) => {
    const defaults: ClaudeDefaults = {
      models: config.claude.model,
      defaultModel: config.claude.model[0],
      maxBudgetUsd: config.claude.maxBudgetUsd,
      interactionTimeout: config.claude.interactionTimeout,
    };
    return reply.send(defaults);
  });
}
