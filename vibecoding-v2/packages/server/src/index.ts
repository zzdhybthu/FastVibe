import { loadConfig } from './config.js';
import { initDb } from './db/index.js';
import { buildServer } from './server.js';
import { syncReposFromConfig } from './routes/repos.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

async function main() {
  const config = loadConfig();

  // Init database
  const dataDir = resolve(import.meta.dirname, '../data');
  mkdirSync(dataDir, { recursive: true });
  initDb(resolve(dataDir, 'vibecoding.db'));

  // Sync repos from config into DB
  await syncReposFromConfig(config);

  // Build and start server
  const app = await buildServer(config);
  await app.listen({ port: config.server.port, host: config.server.host });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
