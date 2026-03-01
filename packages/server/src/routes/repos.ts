import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { realpathSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { getDb, schema } from '../db/index.js';

/**
 * Normalize a filesystem path to its canonical absolute form.
 * Expands ~ to home dir, resolves relative segments, resolves symlinks,
 * and strips trailing slashes.
 */
function normalizePath(p: string): string {
  let expanded = p.startsWith('~') ? p.replace(/^~/, homedir()) : p;
  expanded = resolve(expanded);
  try {
    expanded = realpathSync(expanded);
  } catch {
    // Path may not exist yet; fall back to resolved form
  }
  return expanded;
}

const createRepoSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  mainBranch: z.string().default('main'),
  maxConcurrency: z.number().int().positive().default(3),
});

const updateRepoSchema = z.object({
  path: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  mainBranch: z.string().optional(),
  maxConcurrency: z.number().int().positive().optional(),
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
      path: normalizePath(body.path),
      name: body.name,
      mainBranch: body.mainBranch,
      maxConcurrency: body.maxConcurrency,
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

    // Normalize path if provided
    if (body.path) {
      body.path = normalizePath(body.path);
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
