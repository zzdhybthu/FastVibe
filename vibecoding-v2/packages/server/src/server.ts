import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { AppConfig } from '@vibecoding/shared';
import { repoRoutes } from './routes/repos.js';
import { taskRoutes } from './routes/tasks.js';
import { interactionRoutes } from './routes/interactions.js';

export async function buildServer(config: AppConfig) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Auth hook - check Bearer token on /api/* routes
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const auth = request.headers.authorization;
    if (!auth || auth !== `Bearer ${config.server.authToken}`) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  // Register API routes
  await repoRoutes(app);
  await taskRoutes(app);
  await interactionRoutes(app);

  return app;
}
