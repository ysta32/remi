// Builds the family Timeline (contracts §3/§5). Consent filtering happens HERE, server-side:
// unconsented data is never selected into the response. Repeat evidence is validated internally.
import { getSqlite } from '@/db/client';
import { MARKER_KEYS, markerMeta } from '../analysis/timeline-helpers';
import type { CallCard, Lang, MarkerSeries, NudgeReason, Timeline } from '../types';
import { consentView } from './consent';
import { getConsentRow } from './context';
import { renderNudge } from './nudge-copy';
import { nowIso } from './ids';
import { buildDriftIndexView } from './drift-index-view';
import { buildRepeatAnalysis } from './detector-results';

interface CallRow {
  id: string;
  started_at: string;
  duration_s: number | null;
  status: CallCard['status'];
  summary: string | null;
  mood_label: CallCard['mood'];
  is_simulated: number;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function buildTimeline(elderId: string): Timeline | null {
  const db = getSqlite();
  const elder = db
    .prepare('SELECT id, display_name, preferred_name, language FROM elders WHERE id = ?')
    .get(elderId) as { id: string; display_name: string; preferred_name: string; language: Lang } | undefined;
  if (!elder) return null;

  const consent = consentView(getConsentRow(elderId));
  const eff = consent.effective;

  // Explicit column list: utterances_json is never selected for family endpoints.
  const callRows = db
    .prepare(
      `SELECT id, started_at, duration_s, status, summary, mood_label, is_simulated FROM calls
       WHERE elder_id = ? ORDER BY started_at DESC, created_at DESC`,
    )
    .all(elderId) as CallRow[];

  const events = db
    .prepare(
      `SELECT e.call_id, e.type, e.payload_json FROM call_events e JOIN calls c ON c.id = e.call_id
       WHERE c.elder_id = ? AND e.type IN ('photo_shown','question_asked') ORDER BY e.at_ms`,
    )
    .all(elderId) as { call_id: string; type: 'photo_shown' | 'question_asked'; payload_json: string }[];

  const photoCaptions = new Map(
    (db.prepare('SELECT id, caption FROM photos WHERE elder_id = ?').all(elderId) as { id: string; caption: string }[]).map(
      (p) => [p.id, p.caption],
    ),
  );
  const questions = new Map(
    (
      db.prepare('SELECT id, text, asked_by FROM family_questions WHERE elder_id = ?').all(elderId) as {
        id: string;
        text: string;
        asked_by: string;
      }[]
    ).map((q) => [q.id, q]),
  );
  const answers = new Map<string, string>();
  if (eff.funFacts) {
    const rows = db
      .prepare('SELECT question_id, text FROM fun_facts WHERE elder_id = ? AND question_id IS NOT NULL ORDER BY created_at')
      .all(elderId) as { question_id: string; text: string }[];
    for (const r of rows) if (!answers.has(r.question_id)) answers.set(r.question_id, r.text);
  }

  const shownByCall = new Map<string, { id: string; caption: string }[]>();
  const questionByCall = new Map<string, string>();
  for (const e of events) {
    const payload = safeParse<{ photoId?: string; questionId?: string }>(e.payload_json);
    if (e.type === 'photo_shown' && payload?.photoId) {
      const caption = photoCaptions.get(payload.photoId);
      if (caption === undefined) continue;
      const list = shownByCall.get(e.call_id) ?? [];
      if (!list.some((p) => p.id === payload.photoId)) list.push({ id: payload.photoId, caption });
      shownByCall.set(e.call_id, list);
    } else if (e.type === 'question_asked' && payload?.questionId && !questionByCall.has(e.call_id)) {
      questionByCall.set(e.call_id, payload.questionId);
    }
  }

  const calls: CallCard[] = callRows.map((c) => {
    const qid = questionByCall.get(c.id);
    const q = qid ? questions.get(qid) : undefined;
    return {
      id: c.id,
      startedAt: c.started_at,
      durationS: c.duration_s,
      status: c.status,
      summary: eff.summaries ? c.summary : null,
      // SPEC §12: before the elder confirms sharing, the family sees only that a call happened
      // and its length — so call details stay hidden until elderConfirmed.
      photosShown: consent.elderConfirmed ? (shownByCall.get(c.id) ?? []) : [],
      familyQuestion:
        consent.elderConfirmed && q ? { text: q.text, askedBy: q.asked_by, answer: answers.get(q.id) ?? null } : null,
      mood: eff.mood ? c.mood_label : null,
      isSimulated: c.is_simulated === 1,
    };
  });

  const funFacts: Timeline['funFacts'] = eff.funFacts
    ? (
        db
          .prepare(
            `SELECT f.id, f.text, f.quote, f.is_simulated, c.started_at, q.asked_by
             FROM fun_facts f JOIN calls c ON c.id = f.call_id
             LEFT JOIN family_questions q ON q.id = f.question_id
             WHERE f.elder_id = ? ORDER BY c.started_at DESC, f.created_at DESC`,
          )
          .all(elderId) as {
          id: string;
          text: string;
          quote: string;
          is_simulated: number;
          started_at: string;
          asked_by: string | null;
        }[]
      ).map((f) => ({
        id: f.id,
        text: f.text,
        quote: f.quote,
        askedBy: f.asked_by,
        at: f.started_at,
        isSimulated: f.is_simulated === 1,
      }))
    : [];

  const markers: MarkerSeries[] = eff.speechTrends ? buildMarkers(elderId, elder.language) : [];
  const repeats: Timeline['repeats'] = eff.speechTrends ? buildRepeats(elderId) : [];

  const nudgeRows = db
    .prepare(
      `SELECT id, type, reason_json, created_at, is_simulated FROM nudges
       WHERE elder_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC`,
    )
    .all(elderId) as {
    id: string;
    type: 'cognitive_checkup' | 'wellbeing';
    reason_json: string;
    created_at: string;
    is_simulated: number;
  }[];
  const nudges: Timeline['nudges'] = nudgeRows
    .filter((n) => (n.type === 'cognitive_checkup' ? eff.speechTrends : eff.mood))
    .map((n) => {
      const { message, link } = renderNudge(n.type, elder.preferred_name, safeParse<NudgeReason>(n.reason_json));
      return { id: n.id, type: n.type, createdAt: n.created_at, message, link, isSimulated: n.is_simulated === 1 };
    });

  const driftIndex = buildDriftIndexView(db, elderId, elder.language, eff);
  const repeatAnalysis = buildRepeatAnalysis(db, elderId, eff);
  return {
    ...(driftIndex ? { driftIndex } : {}),
    ...(repeatAnalysis ? { repeatAnalysis } : {}),
    elder: {
      id: elder.id,
      displayName: elder.display_name,
      preferredName: elder.preferred_name,
      language: elder.language,
    },
    consent,
    calls,
    funFacts,
    markers,
    repeats,
    nudges,
    processing: callRows.some((c) => c.status === 'processing'),
    generatedAt: nowIso(),
  };
}

function buildMarkers(elderId: string, lang: Lang): MarkerSeries[] {
  const db = getSqlite();
  const baselineStmt = db.prepare(
    'SELECT median, mad, n FROM baselines WHERE elder_id = ? AND marker = ? AND language = ?',
  );
  const pointsStmt = db.prepare(
    `SELECT m.call_id, c.started_at, m.value, m.z, m.confidence, c.is_simulated
     FROM call_markers m JOIN calls c ON c.id = m.call_id
     WHERE c.elder_id = ? AND m.marker = ? AND c.language = ? AND c.status != 'failed' ORDER BY c.started_at`,
  );
  return MARKER_KEYS.map((key) => {
    const meta = markerMeta(key, lang);
    const b = baselineStmt.get(elderId, key, lang) as { median: number; mad: number; n: number } | undefined;
    // Baselines and units are per language, so only plot this language's calls.
    const pts = pointsStmt.all(elderId, key, lang) as {
      call_id: string;
      started_at: string;
      value: number | null;
      z: number | null;
      confidence: 'high' | 'low' | 'na';
      is_simulated: number;
    }[];
    return {
      key,
      label: meta.label,
      explainer: meta.explainer,
      unit: meta.unit,
      concern: meta.concern,
      group: meta.group,
      baseline: b ? { median: b.median, mad: b.mad, n: b.n } : null,
      points: pts.map((p) => ({
        callId: p.call_id,
        at: p.started_at,
        value: p.value,
        z: p.z,
        confidence: p.confidence,
        isSimulated: p.is_simulated === 1,
      })),
    };
  });
}

/** Groups topics linked by repeat_of_topic_id chains; only groups with at least one repeat are returned. */
function buildRepeats(elderId: string): Timeline['repeats'] {
  const rows = getSqlite()
    .prepare(
      `SELECT t.id, t.summary, t.repeat_of_topic_id, t.is_simulated, c.started_at
       FROM topics t JOIN calls c ON c.id = t.call_id WHERE t.elder_id = ? ORDER BY c.started_at`,
    )
    .all(elderId) as {
    id: string;
    summary: string;
    repeat_of_topic_id: string | null;
    is_simulated: number;
    started_at: string;
  }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rootOf = (id: string): string => {
    let cur = id;
    const seen = new Set<string>();
    while (!seen.has(cur)) {
      seen.add(cur);
      const parent = byId.get(cur)?.repeat_of_topic_id;
      if (!parent || !byId.has(parent)) break;
      cur = parent;
    }
    return cur;
  };
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const root = rootOf(r.id);
    const g = groups.get(root) ?? [];
    g.push(r);
    groups.set(root, g);
  }
  const out: Timeline['repeats'] = [];
  for (const [rootId, members] of groups) {
    if (members.length < 2) continue;
    const dates = [...new Set(members.map((m) => m.started_at))].sort();
    out.push({
      summary: byId.get(rootId)?.summary ?? members[0].summary,
      dates,
      isSimulated: members.some((m) => m.is_simulated === 1),
    });
  }
  out.sort((a, b) => (a.dates[a.dates.length - 1] < b.dates[b.dates.length - 1] ? 1 : -1));
  return out;
}
