// Process-wide SQLite connection. Stored on globalThis so Next dev HMR doesn't open a new
// handle per reload. Opening migrates (idempotent), so a fresh DATABASE_PATH just works.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { config } from '../lib/config';
import { migrate } from './migrate';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

type Handle = { path: string; sqlite: Database.Database; db: Db };
const g = globalThis as unknown as { __remiDb?: Handle };

function open(): Handle {
  const dbPath = config.databasePath;
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  migrate(sqlite);
  return { path: dbPath, sqlite, db: drizzle(sqlite, { schema }) };
}

function handle(): Handle {
  // Re-open if DATABASE_PATH changed (tests point each suite at a fresh file).
  if (!g.__remiDb || g.__remiDb.path !== config.databasePath) {
    g.__remiDb?.sqlite.close();
    g.__remiDb = open();
  }
  return g.__remiDb;
}

export function getDb(): Db {
  return handle().db;
}

/** Raw better-sqlite3 handle, for transactions and hand-written SQL. */
export function getSqlite(): Database.Database {
  return handle().sqlite;
}

export function closeDb(): void {
  g.__remiDb?.sqlite.close();
  g.__remiDb = undefined;
}
