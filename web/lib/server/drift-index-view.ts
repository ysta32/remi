// Adapter only: production scoring and thresholds remain in runDriftIndex.
import type Database from 'better-sqlite3';
import { DEFAULT_DRIFT_INDEX_OPTIONS, runDriftIndex, type IndexCall } from '../analysis/drift-index';
import { TEXT_MARKER_KEYS } from '../markers/meta';
import type { DriftIndexView, Lang, MarkerKey } from '../types';
import { isSyntheticTranscriptDemo } from '../synthetic-demo';
import { liveResults } from './live-repeats';
import { hasDetectorResults, readDetectorCorpus, validatedResults } from './detector-results';

export function buildDriftIndexView(db: Database.Database, elderId: string, language: Lang, consent: { speechTrends: boolean; mood: boolean }): DriftIndexView | undefined {
  if (!consent.speechTrends) return undefined;
  const rows = db.prepare(`SELECT id,started_at,mood_label,is_simulated FROM calls WHERE elder_id=? AND language=? AND status='done' ORDER BY started_at,id`).all(elderId, language) as {id:string; started_at:string; mood_label:string|null; is_simulated:number}[];
  const dated = rows.filter(row => Number.isFinite(Date.parse(row.started_at)));
  const markers = db.prepare(`SELECT m.call_id,m.marker,m.value,m.confidence FROM call_markers m JOIN calls c ON c.id=m.call_id WHERE c.elder_id=? AND c.language=? AND c.status='done'`).all(elderId, language) as {call_id:string;marker:MarkerKey;value:number|null;confidence:string}[];
  const byCall = new Map<string, IndexCall['values']>();
  for (const marker of markers) {
    if (!(TEXT_MARKER_KEYS as readonly string[]).includes(marker.marker) || marker.confidence !== 'high' || typeof marker.value !== 'number' || !Number.isFinite(marker.value)) continue;
    const values = byCall.get(marker.call_id) ?? {}; values[marker.marker] = marker.value; byCall.set(marker.call_id, values);
  }
  const repeats = new Map<string, number>();
  {
    const real = liveResults(db, elderId).results;
    try {
      const results = real.length ? real : hasDetectorResults(db) ? validatedResults(db, readDetectorCorpus(db, elderId)) : [];
      for (const result of results) {
        const items = new Map(result.items.map(item => [item.id,item]));
        repeats.set(result.callId, result.matches.filter(match => {
          const item = items.get(match.itemId);
          return match.isRepeat && item?.kind === 'story' && item.elicitation === 'unprompted';
        }).length);
      }
    } catch { /* Missing/stale/unsupported detector evidence remains unknown. */ }
  }
  const origin = dated.length ? Date.parse(dated[0].started_at) : 0;
  const calls: IndexCall[] = dated.map(row => ({callId:row.id,day:(Date.parse(row.started_at)-origin)/86400000,adequate:byCall.get(row.id)?.speech_rate !== undefined, values:byCall.get(row.id) ?? {},repeats:repeats.get(row.id) ?? null,moodLow:consent.mood && ['positive','neutral','low'].includes(row.mood_label ?? '') ? row.mood_label === 'low' : null}));
  const rules = structuredClone(DEFAULT_DRIFT_INDEX_OPTIONS), result = runDriftIndex(calls);
  const eligible = calls.filter(call => call.adequate), n = eligible.length;
  const monitored = result.baseline ? result.calls.filter(call => call.day > result.baseline!.endDay) : [];
  const profile = db.prepare('SELECT about FROM elders WHERE id=?').get(elderId) as {about:string} | undefined;
  const authored = isSyntheticTranscriptDemo(profile, dated.map(row => ({isSimulated:row.is_simulated === 1})));
  const simulated = dated.filter(row => row.is_simulated === 1).length;
  const known = eligible.filter(call => call.repeats !== null);
  return {language,baselineProgress:{familiarizationCalls:Math.min(n,rules.skipFirst),familiarizationRequired:rules.skipFirst,baselineCalls:Math.min(Math.max(0,n-rules.skipFirst),rules.baselineN),baselineRequired:rules.baselineN,ready:result.baseline !== null},eligibleCallCount:n,monitoredCallCount:monitored.length,
    completedMonitoringWeeks:result.weeks.filter(week => !week.baselineWeek && week.weeklyD !== null).length,
    repeatCoverage:{knownCallCount:known.length,unknownCallCount:n-known.length,unpromptedStoryCount:known.reduce((sum,call)=>sum+call.repeats!,0)},
    provenance:{isSimulated:simulated>0,timing:authored ? 'synthetic_authored' : simulated === 0 ? 'stored_call_timing' : 'unknown',computation:'read_only',notificationDelivery:'not_performed'},rules,result};
}
