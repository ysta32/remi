// Applies db/migrations/*.sql in order (tracked in _migrations), then upserts the themes.
// The SQL files are the contract DDL verbatim; schema.ts mirrors them for typed queries.
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { THEMES } from './themes';

// Resolved from cwd (always web/ for next, vitest and tsx): Next bundles server code,
// so import.meta.url would not point at this source folder.
const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

export function migrate(sqlite: Database.Database): void {
  sqlite.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (sqlite.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    })();
  }
  seedThemes(sqlite);
}

export function seedThemes(sqlite: Database.Database): void {
  const upsert = sqlite.prepare(
    `INSERT INTO themes (id, title, prompt_en, prompt_zh, sort) VALUES (@id, @title, @prompt_en, @prompt_zh, @sort)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, prompt_en=excluded.prompt_en, prompt_zh=excluded.prompt_zh, sort=excluded.sort`,
  );
  sqlite.transaction(() => THEMES.forEach((t) => upsert.run(t)))();
}
