import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { AppConfig } from '@vibecoding/shared';

const configSchema = z.object({
  server: z.object({
    port: z.number().default(8420),
    host: z.string().default('0.0.0.0'),
    authToken: z.string(),
  }),
  global: z.object({
    maxTotalConcurrency: z.number().default(5),
  }),
  repos: z.array(z.object({
    path: z.string(),
    name: z.string(),
    mainBranch: z.string().default('main'),
    maxConcurrency: z.number().default(3),
    git: z.object({
      user: z.string(),
      email: z.string(),
    }),
  })).default([]),
  docker: z.object({
    image: z.string().default('vibecoding-worker:latest'),
    binds: z.array(z.string()).default([]),
    networkMode: z.string().default('host'),
  }),
  claude: z.object({
    model: z.string().default('claude-sonnet-4-6'),
    maxBudgetUsd: z.number().default(5.0),
    interactionTimeout: z.number().default(1800),
  }),
});

export function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH
    || resolve(import.meta.dirname, '../../../config.yaml');
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw);
  return configSchema.parse(parsed);
}
