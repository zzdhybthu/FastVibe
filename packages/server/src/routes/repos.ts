import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { AppConfig } from '@vibecoding/shared';
import { getDb, schema } from '../db/index.js';

const createRepoSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  mainBranch: z.string().default('main'),
  maxConcurrency: z.number().int().positive().default(3),
  gitUser: z.string().min(1),
  gitEmail: z.string().min(1),
});

const updateRepoSchema = z.object({
  path: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  mainBranch: z.string().optional(),
  maxConcurrency: z.number().int().positive().optional(),
  gitUser: z.string().min(1).optional(),
  gitEmail: z.string().min(1).optional(),
});

export async function repoRoutes(app: FastifyInstance) {
  // GET /api/repos — list all repos
  app.get('/api/repos', async (_request, reply) => {
    const db = getDb();
    const allRepos = await db.select().from(schema.repos);
    return reply.send(allRepos);
  });

  // POST /api/repos — create repo
  app.post('/api/repos', async (request, reply) => {
    const db = getDb();
    let body: z.infer<typeof createRepoSchema>;
    try {
      body = createRepoSchema.parse(request.body);
    } catch (err) {
      return reply.code(400).send({ error: 'Validation failed', details: (err as z.ZodError).errors });
    }

    const newRepo = {
      id: uuid(),
      path: body.path,
      name: body.name,
      mainBranch: body.mainBranch,
      maxConcurrency: body.maxConcurrency,
      gitUser: body.gitUser,
      gitEmail: body.gitEmail,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.insert(schema.repos).values(newRepo);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return reply.code(409).send({ error: 'A repo with this path already exists' });
      }
      throw err;
    }
    return reply.code(201).send(newRepo);
  });

  // PUT /api/repos/:id — update repo (partial)
  app.put<{ Params: { id: string } }>('/api/repos/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    let body: z.infer<typeof updateRepoSchema>;
    try {
      body = updateRepoSchema.parse(request.body);
    } catch (err) {
      return reply.code(400).send({ error: 'Validation failed', details: (err as z.ZodError).errors });
    }

    // Check if repo exists
    const existing = await db.select().from(schema.repos).where(eq(schema.repos.id, id));
    if (existing.length === 0) {
      return reply.code(404).send({ error: 'Repo not found' });
    }

    await db.update(schema.repos).set(body).where(eq(schema.repos.id, id));

    // Return updated repo
    const updated = await db.select().from(schema.repos).where(eq(schema.repos.id, id));
    return reply.send(updated[0]);
  });

  // DELETE /api/repos/:id — delete repo
  app.delete<{ Params: { id: string } }>('/api/repos/:id', async (request, reply) => {
    const db = getDb();
    const { id } = request.params;

    const existing = await db.select().from(schema.repos).where(eq(schema.repos.id, id));
    if (existing.length === 0) {
      return reply.code(404).send({ error: 'Repo not found' });
    }

    await db.delete(schema.repos).where(eq(schema.repos.id, id));
    return reply.code(204).send();
  });
}

/**
 * Upsert repos from config.yaml into the database on startup.
 * Uses path as the unique key — if a repo with the same path exists, update it;
 * otherwise, insert a new one.
 */
export async function syncReposFromConfig(config: AppConfig) {
  const db = getDb();

  for (const repoConfig of config.repos) {
    const existing = await db
      .select()
      .from(schema.repos)
      .where(eq(schema.repos.path, repoConfig.path));

    if (existing.length > 0) {
      // Update existing repo
      await db
        .update(schema.repos)
        .set({
          name: repoConfig.name,
          mainBranch: repoConfig.mainBranch,
          maxConcurrency: repoConfig.maxConcurrency,
          gitUser: repoConfig.git.user,
          gitEmail: repoConfig.git.email,
        })
        .where(eq(schema.repos.path, repoConfig.path));
    } else {
      // Insert new repo
      await db.insert(schema.repos).values({
        id: uuid(),
        path: repoConfig.path,
        name: repoConfig.name,
        mainBranch: repoConfig.mainBranch,
        maxConcurrency: repoConfig.maxConcurrency,
        gitUser: repoConfig.git.user,
        gitEmail: repoConfig.git.email,
        createdAt: new Date().toISOString(),
      });
    }
  }
}
