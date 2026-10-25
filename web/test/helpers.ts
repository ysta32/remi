// Test helpers: a fresh SQLite file per test, plus small factories for common rows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getSqlite } from '@/db/client';
import { newId, nowIso } from '@/lib/server/ids';

/** Point DATABASE_PATH/UPLOAD_DIR at a fresh temp dir and open (and migrate) it. */
export function freshDb(): void {
  closeDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remi-test-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  getSqlite();
}

export function insertElder(overrides: Partial<Record<string, unknown>> = {}): string {
  const id = (overrides.id as string) ?? newId();
  const row = {
    id,
    display_name: 'Harold Bennett',
    preferred_name: 'Hal',
    language: 'en',
    timezone: 'America/New_York',
    about: '',
    primary_contact_name: 'Linda',
    is_simulated: 0,
    created_at: nowIso(),
    ...overrides,
  };
  const db = getSqlite();
  db.prepare(
    `INSERT INTO elders (id, display_name, preferred_name, language, timezone, about, primary_contact_name, is_simulated, created_at)
     VALUES (@id, @display_name, @preferred_name, @language, @timezone, @about, @primary_contact_name, @is_simulated, @created_at)`,
  ).run(row);
  db.prepare('INSERT INTO consents (elder_id, updated_at) VALUES (?, ?)').run(id, nowIso());
  return id;
}

export function insertCall(elderId: string, overrides: Partial<Record<string, unknown>> = {}): string {
  const id = (overrides.id as string) ?? newId();
  const row = {
    id,
    elder_id: elderId,
    started_at: nowIso(),
    ended_at: null,
    duration_s: null,
    language: 'en',
    status: 'done',
    utterances_json: null,
    summary: null,
    mood_label: null,
    is_simulated: 0,
    created_at: nowIso(),
    ...overrides,
  };
  getSqlite()
    .prepare(
      `INSERT INTO calls (id, elder_id, started_at, ended_at, duration_s, language, status, utterances_json, summary, mood_label, is_simulated, created_at)
       VALUES (@id, @elder_id, @started_at, @ended_at, @duration_s, @language, @status, @utterances_json, @summary, @mood_label, @is_simulated, @created_at)`,
    )
    .run(row);
  return id;
}
