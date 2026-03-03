import { loadConfig } from './config.js';
import { initDb } from './db/index.js';
import { buildServer } from './server.js';
import { initTaskQueue } from './services/task-queue.js';
import { recoverOnStartup } from './services/recovery.js';
import { Scheduler } from './services/scheduler.js';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

// Catch unhandled rejections from the Claude Agent SDK's internal async
// operations. When a task is aborted while the SDK is handling an MCP tool
// call, the SDK tries to write a response to the already-dead process,
// producing an "Operation aborted" rejection we cannot catch locally.
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg === 'Operation aborted') return; // expected during task cancellation
  console.error('Unhandled rejection:', reason);
});

async function main() {
  const config = loadConfig();

  // Init database
  const dataDir = resolve(import.meta.dirname, '../data');
  mkdirSync(dataDir, { recursive: true });
  initDb(resolve(dataDir, 'vibecoding.db'));

  // Init task queue
  initTaskQueue(config);

  // Recover from previous crash
  await recoverOnStartup();

  // Build and start server
  const app = await buildServer(config);
  await app.listen({ port: config.server.port, host: config.server.host });

  // Start scheduler
  const scheduler = new Scheduler();
  scheduler.start();
  console.log('Scheduler started');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    scheduler.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
