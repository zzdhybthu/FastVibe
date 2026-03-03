import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { AppConfig } from '@fastvibe/shared';
import { repoRoutes } from './routes/repos.js';
import { taskRoutes } from './routes/tasks.js';
import { interactionRoutes } from './routes/interactions.js';
import { configRoutes } from './routes/config.js';
import { registerWebSocket } from './ws/handler.js';

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
  await taskRoutes(app, config);
  await interactionRoutes(app);
  await configRoutes(app, config);

  // Register WebSocket handler
  await registerWebSocket(app, config);

  // Serve frontend static files in production
  const webDistPath = resolve(import.meta.dirname, '../../web/dist');
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback - serve index.html for all non-API, non-WS routes
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
        reply.code(404).send({ error: 'Not found' });
      } else {
        return reply.sendFile('index.html');
      }
    });
  }

  return app;
}
