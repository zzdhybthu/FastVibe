import type { FastifyInstance } from 'fastify';
import type { AppConfig, AgentDefaults } from '@fastvibe/shared';

export async function configRoutes(app: FastifyInstance, config: AppConfig) {
  app.get('/api/config/agent-defaults', async (_request, reply) => {
    const defaults: AgentDefaults = {
      defaultAgent: config.defaultAgent,
      claude: {
        models: config.claude.model,
        defaultModel: config.claude.model[0],
        maxBudgetUsd: config.claude.maxBudgetUsd,
        interactionTimeout: config.claude.interactionTimeout,
      },
      codex: {
        models: config.codex.model,
        defaultModel: config.codex.model[0],
      },
    };
    return reply.send(defaults);
  });
}
