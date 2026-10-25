// Builds the agent's CallContext (contracts §3/§4). Synchronous better-sqlite3 queries only, so it stays fast.
import { getSqlite } from '@/db/client';
import { rememberedFacts } from './live-notes';
import { config } from '../config';
import type { CallContext, Lang } from '../types';
import { consentView, type ConsentRow } from './consent';

interface ElderRow {
  id: string;
  display_name: string;
  preferred_name: string;
  language: Lang;
  timezone: string;
  about: string;
  primary_contact_name: string;
}

interface ThemeRow {
  id: string;
  title: string;
  prompt_en: string;
  prompt_zh: string;
  sort: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Calls that really happened. Excludes in_progress (possibly the current call, or an abandoned
// one) and failed rows, so fetching context after POST /calls doesn't shift the theme.
const FINISHED = `status IN ('processing','done')`;

export function getElderRow(elderId: string): ElderRow | undefined {
  return getSqlite()
    .prepare(
      'SELECT id, display_name, preferred_name, language, timezone, about, primary_contact_name FROM elders WHERE id = ?',
    )
    .get(elderId) as ElderRow | undefined;
}

export function getConsentRow(elderId: string): ConsentRow | undefined {
  return getSqlite().prepare('SELECT * FROM consents WHERE elder_id = ?').get(elderId) as ConsentRow | undefined;
}

/** Next theme after the last call's theme in `sort` order (wrapping), or the first theme if there is none. */
export function nextTheme(elderId: string): ThemeRow {
  const db = getSqlite();
  const all = db.prepare('SELECT id, title, prompt_en, prompt_zh, sort FROM themes ORDER BY sort, id').all() as ThemeRow[];
  if (all.length === 0) throw new Error('no themes seeded');
  const last = db
    .prepare(`SELECT theme_id FROM calls WHERE elder_id = ? AND ${FINISHED} ORDER BY started_at DESC, created_at DESC LIMIT 1`)
    .get(elderId) as { theme_id: string | null } | undefined;
  if (!last) return all[0];
  const idx = last.theme_id ? all.findIndex((t) => t.id === last.theme_id) : -1;
  if (idx === -1) return all[0];
  return all[(idx + 1) % all.length];
}

export function buildCallContext(elderId: string, origin: string): CallContext | null {
  const db = getSqlite();
  const elder = getElderRow(elderId);
  if (!elder) return null;

  const members = db
    .prepare('SELECT name, relation FROM family_members WHERE elder_id = ? ORDER BY rowid')
    .all(elderId) as { name: string; relation: string }[];

  const lastCall = db
    .prepare(
      `SELECT id, ended_at, started_at, summary FROM calls
       WHERE elder_id = ? AND status = 'done' AND summary IS NOT NULL
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(elderId) as { id: string; ended_at: string | null; started_at: string; summary: string } | undefined;

  const knownFacts = (
    db
      .prepare(
        `SELECT f.text FROM fun_facts f JOIN calls c ON c.id = f.call_id
         WHERE f.elder_id = ? ORDER BY c.started_at DESC, f.created_at DESC LIMIT 10`,
      )
      .all(elderId) as { text: string }[]
  ).map((r) => r.text);
  // Things Hal asked Remi to remember on earlier calls (Live tab notes) come first.
  knownFacts.unshift(...rememberedFacts(elderId, 8).filter((f) => !knownFacts.includes(f)));

  const since = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const recentStories = (
    db
      .prepare(
        `SELECT t.summary FROM topics t JOIN calls c ON c.id = t.call_id
         WHERE t.elder_id = ? AND t.kind = 'story' AND t.initiated_by = 'caller' AND c.started_at >= ?
         ORDER BY c.started_at DESC, t.created_at DESC LIMIT 8`,
      )
      .all(elderId, since) as { summary: string }[]
  ).map((r) => r.summary);

  const photos = (
    db
      .prepare(
        `SELECT id, caption, people FROM photos WHERE elder_id = ?
         ORDER BY (last_shown_at IS NOT NULL), last_shown_at, created_at LIMIT 5`,
      )
      .all(elderId) as { id: string; caption: string; people: string }[]
  ).map((p) => ({ ...p, imageUrl: `${origin}/api/agent/photos/${p.id}` }));

  const q = db
    .prepare(
      `SELECT id, text, asked_by FROM family_questions WHERE elder_id = ? AND status = 'pending'
       ORDER BY created_at, rowid LIMIT 1`,
    )
    .get(elderId) as { id: string; text: string; asked_by: string } | undefined;

  const priorCalls = db.prepare(`SELECT COUNT(*) AS n FROM calls WHERE elder_id = ? AND ${FINISHED}`).get(elderId) as {
    n: number;
  };
  const theme = nextTheme(elderId);

  return {
    elder: {
      id: elder.id,
      displayName: elder.display_name,
      preferredName: elder.preferred_name,
      language: elder.language,
      timezone: elder.timezone,
      about: elder.about,
    },
    family: { primaryContactName: elder.primary_contact_name, members },
    consent: consentView(getConsentRow(elderId)),
    lastCall: lastCall
      ? { id: lastCall.id, endedAt: lastCall.ended_at ?? lastCall.started_at, summary: lastCall.summary }
      : null,
    knownFacts,
    recentStories,
    photos,
    familyQuestion: q ? { id: q.id, text: q.text, askedBy: q.asked_by } : null,
    theme: { id: theme.id, title: theme.title, prompt: elder.language === 'zh' ? theme.prompt_zh : theme.prompt_en },
    isFirstCall: priorCalls.n === 0,
    demoMode: config.demoMode,
  };
}
