import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle<typeof schema>>;

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  // tsup bundles into dist/index.js (1 level deep), tsx runs from src/db/ (2 levels deep)
  const migrationsFolder = resolve(import.meta.dirname, import.meta.dirname.includes('/dist') ? '../drizzle' : '../../drizzle');
  migrate(db, { migrationsFolder });
  return db;
}

export { schema };
