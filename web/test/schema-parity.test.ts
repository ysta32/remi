import { getTableColumns, getTableName } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getSqlite } from '@/db/client';
import * as schema from '@/db/schema';
import { THEMES } from '@/db/themes';
import { freshDb } from './helpers';

const tables = Object.values(schema).filter((t) => typeof t === 'object' && t && getTableName(t as never));

describe('schema parity (SQL migration vs drizzle schema)', () => {
  beforeAll(() => freshDb());

  it('creates all 15 contract tables', () => {
    const names = (getSqlite().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
    expect(names.sort()).toEqual(tables.map((t) => getTableName(t as never)).sort());
    expect(names).toHaveLength(15);
  });

  it.each(tables.map((t) => [getTableName(t as never), t]))('%s columns match', (name, table) => {
    // SQLite reports notnull=0 for TEXT PRIMARY KEY columns; drizzle marks them notNull.
    const sqlCols = (getSqlite().prepare(`PRAGMA table_info(${name})`).all() as { name: string; notnull: number; pk: number }[])
      .map((c) => `${c.name}:${c.notnull || c.pk ? 1 : 0}`)
      .sort();
    const cols = Object.values(getTableColumns(table as never)) as { name: string; notNull: boolean }[];
    const drizzleCols = cols.map((c) => `${c.name}:${c.notNull ? 1 : 0}`).sort();
    expect(drizzleCols).toEqual(sqlCols);
  });

  it('seeds 8 themes idempotently', () => {
    freshDb();
    expect((getSqlite().prepare('SELECT count(*) n FROM themes').get() as { n: number }).n).toBe(THEMES.length);
  });
});
