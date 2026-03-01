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
