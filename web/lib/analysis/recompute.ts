// recomputeElder (contracts §7): rebuild repeat_stories rows, baselines, z and nudges for one elder
// from stored rows. One SQLite transaction, no model calls, idempotent.
import { getSqlite } from '@/db/client';
import { newId, nowIso } from '@/lib/server/ids';
import { markerMeta, MARKER_KEYS } from '../markers/meta';
import type { MarkerKey, NudgeReason } from '../types';
import { ABS_SPREAD_FLOOR, BASELINE_N, MIN_SCALE, NUDGE_REFIRE_DAYS } from './config';
import { checkupNudge, wellbeingNudge, weeklyDrift, type DriftCall } from './drift';
import { buildBaseline, signedZ, type Baseline } from './stats';
import { isoWeekKey } from './weeks';

const MS_PER_DAY = 86_400_000;
const Z_MARKERS: MarkerKey[] = MARKER_KEYS.filter((k) => k !== 'repeat_stories');

interface ElderRow {
  id: string;
  timezone: string;
  is_simulated: number;
}
interface CallRow {
  id: string;
  started_at: string;
  language: 'en' | 'zh';
  mood_label: string | null;
}
interface MarkerRow {
  call_id: string;
  marker: string;
  value: number | null;
  confidence: 'high' | 'low' | 'na';
}
interface ConsentRow {
  fam_speech_trends: number;
  fam_mood: number;
  elder_speech_trends: number | null;
  elder_mood: number | null;
}

export async function recomputeElder(elderId: string): Promise<void> {
  const db = getSqlite();
  db.transaction(() => {
    const elder = db.prepare('SELECT id, timezone, is_simulated FROM elders WHERE id = ?').get(elderId) as
      | ElderRow
      | undefined;
    if (!elder) return;

    const calls = db
      .prepare(
        `SELECT id, started_at, language, mood_label FROM calls
         WHERE elder_id = ? AND status = 'done' ORDER BY started_at, id`,
      )
      .all(elderId) as CallRow[];

    const loadMarkers = () => {
      const rows = db
        .prepare(
          `SELECT m.call_id, m.marker, m.value, m.confidence FROM call_markers m
           JOIN calls c ON c.id = m.call_id WHERE c.elder_id = ? AND c.status = 'done'`,
        )
        .all(elderId) as MarkerRow[];
      const byCall = new Map<string, Map<string, MarkerRow>>();
      for (const r of rows) {
        const m = byCall.get(r.call_id) ?? new Map<string, MarkerRow>();
        m.set(r.marker, r);
        byCall.set(r.call_id, m);
      }
      return byCall;
    };

    let markersByCall = loadMarkers();
    // A call is adequate when any non-repeat marker kept 'high' confidence (inadequate calls are downgraded).
    const adequate = new Set(
      calls
        .filter((c) => {
          const m = markersByCall.get(c.id);
          return !!m && Z_MARKERS.some((k) => m.get(k)?.confidence === 'high');
        })
        .map((c) => c.id),
    );

    // 1. repeat_stories from topics.repeat_of_topic_id (caller-initiated stories only).
    const countRepeats = db.prepare(
      `SELECT COUNT(*) AS n FROM topics WHERE call_id = ? AND kind = 'story'
       AND initiated_by = 'caller' AND repeat_of_topic_id IS NOT NULL`,
    );
    const upsertMarker = db.prepare(
      `INSERT INTO call_markers (call_id, marker, value, unit, z, confidence)
       VALUES (@call_id, @marker, @value, @unit, NULL, @confidence)
       ON CONFLICT (call_id, marker) DO UPDATE SET value = excluded.value, unit = excluded.unit,
         z = NULL, confidence = excluded.confidence`,
    );
    for (const c of calls) {
      if (!markersByCall.has(c.id)) continue;
      const n = (countRepeats.get(c.id) as { n: number }).n;
      upsertMarker.run({
        call_id: c.id,
        marker: 'repeat_stories',
        value: n,
        unit: markerMeta('repeat_stories', c.language).unit,
        confidence: adequate.has(c.id) ? 'high' : 'low',
      });
    }
    markersByCall = loadMarkers();

    // 2. Baselines: first BASELINE_N adequate calls with a high-confidence value, per marker and language. Frozen once stored.
    const baselineRows = db
      .prepare('SELECT marker, language, median, mad, n FROM baselines WHERE elder_id = ?')
      .all(elderId) as (Baseline & { marker: string; language: string })[];
    const baselines = new Map<string, Baseline>(baselineRows.map((b) => [`${b.marker}|${b.language}`, b]));
    const insertBaseline = db.prepare(
      `INSERT INTO baselines (elder_id, marker, language, median, mad, n, call_ids_json, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const highValue = (callId: string, k: MarkerKey): number | null => {
      const r = markersByCall.get(callId)?.get(k);
      return r && r.confidence === 'high' && r.value !== null ? r.value : null;
    };
    for (const lang of ['en', 'zh'] as const) {
      for (const k of Z_MARKERS) {
        const key = `${k}|${lang}`;
        if (baselines.has(key)) continue;
        const picked = calls
          .filter((c) => c.language === lang && adequate.has(c.id) && highValue(c.id, k) !== null)
          .slice(0, BASELINE_N);
        if (picked.length < BASELINE_N) continue;
        const b = buildBaseline(picked.map((c) => highValue(c.id, k)!));
        insertBaseline.run(elderId, k, lang, b.median, b.mad, b.n, JSON.stringify(picked.map((c) => c.id)), nowIso());
        baselines.set(key, b);
      }
    }

    // 3. z for every high-confidence value with a baseline (baseline calls included), else NULL.
    const setZ = db.prepare('UPDATE call_markers SET z = ? WHERE call_id = ? AND marker = ?');
    const zByCall = new Map<string, Partial<Record<MarkerKey, number | null>>>();
    for (const c of calls) {
      const rows = markersByCall.get(c.id);
      if (!rows) continue;
      const zs: Partial<Record<MarkerKey, number | null>> = {};
      for (const r of rows.values()) {
        const k = r.marker as MarkerKey;
        const b = Z_MARKERS.includes(k) ? baselines.get(`${k}|${c.language}`) : undefined;
        const z = b && r.confidence === 'high' && r.value !== null ? signedZ(r.value, b, markerMeta(k).concern, ABS_SPREAD_FLOOR[k] ?? MIN_SCALE) : null;
        if (Z_MARKERS.includes(k)) zs[k] = z;
        setZ.run(z, c.id, r.marker);
      }
      zByCall.set(c.id, zs);
    }

    // 4. Effective consent = family proposed AND elder confirmed.
    const consent = db
      .prepare('SELECT fam_speech_trends, fam_mood, elder_speech_trends, elder_mood FROM consents WHERE elder_id = ?')
      .get(elderId) as ConsentRow | undefined;
    const speechTrends = !!consent && consent.fam_speech_trends === 1 && consent.elder_speech_trends === 1;
    const mood = !!consent && consent.fam_mood === 1 && consent.elder_mood === 1;

    // 5. Nudges.
    const driftCalls: DriftCall[] = calls.map((c) => {
      const rs = markersByCall.get(c.id)?.get('repeat_stories');
      return {
        callId: c.id,
        isoWeek: isoWeekKey(c.started_at, elder.timezone),
        adequate: adequate.has(c.id),
        z: zByCall.get(c.id) ?? {},
        repeatStories: rs && rs.confidence === 'high' ? rs.value : null,
      };
    });
    const candidates: { type: 'cognitive_checkup' | 'wellbeing'; reason: NudgeReason | null }[] = [
      {
        type: 'cognitive_checkup',
        reason: checkupNudge({ weeks: weeklyDrift(driftCalls), adequateCallCount: adequate.size, speechTrends }),
      },
      { type: 'wellbeing', reason: wellbeingNudge({ moods: calls.map((c) => c.mood_label), mood }) },
    ];
    const refireCutoff = new Date(Date.now() - NUDGE_REFIRE_DAYS * MS_PER_DAY).toISOString();
    const blocking = db.prepare(
      `SELECT COUNT(*) AS n FROM nudges WHERE elder_id = ? AND type = ?
       AND (dismissed_at IS NULL OR dismissed_at > ?)`,
    );
    const insertNudge = db.prepare(
      `INSERT INTO nudges (id, elder_id, type, reason_json, created_at, dismissed_at, is_simulated)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    );
    for (const { type, reason } of candidates) {
      if (!reason) continue;
      if ((blocking.get(elderId, type, refireCutoff) as { n: number }).n > 0) continue;
      insertNudge.run(newId(), elderId, type, JSON.stringify(reason), nowIso(), elder.is_simulated);
    }
  })();
}
