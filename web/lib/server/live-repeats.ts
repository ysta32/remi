// Automatic real-call adapter; the evaluated standalone detector stays unchanged.
import type Database from 'better-sqlite3';
import { analyzeCall, classifyCandidates, findCandidates, makeItemId, parseCall, parseHistory, type EmbeddedItem, type OpenAIOptions } from '../../../detector/src/index.mjs';
import { SAFETY_SUMMARY_LINE } from '../analysis/prompts';
import type { LiveDetectorCacheRow, Utterance } from '../types';
import { effectiveConsent, type ConsentRow } from './consent';
import { fingerprint, repeatAnalysisView, settingsFingerprint, type CorpusCall, type SuccessfulAnalysis } from './detector-results';

export const LIVE_DETECTOR_SETTINGS = Object.freeze({ extractionModel: 'gpt-6.1-sol', embeddingModel: 'text-embedding-3-small', embeddingDimensions: 1536, threshold: 0.85 });
const SETTINGS_HASH = settingsFingerprint(LIVE_DETECTOR_SETTINGS);
const fail = (reason: string) => new Error(`LIVE_REPEATS_${reason}`);
type Row = { id: string; elder_id: string; started_at: string; ended_at: string | null; language: string; utterances_json: string | null };
type Stored = LiveDetectorCacheRow;
const consent = (db: Database.Database, elderId: string) => effectiveConsent(db.prepare('SELECT * FROM consents WHERE elder_id=?').get(elderId) as ConsentRow | undefined);

/** Include only completed real evidence (plus the pipeline's current processing call). */
function corpusFor(db: Database.Database, elderId: string, processingId = ''): CorpusCall[] {
  const rows = db.prepare(`SELECT c.id,c.elder_id,c.started_at,c.ended_at,c.language,c.utterances_json FROM calls c
    WHERE c.elder_id=? AND c.is_simulated=0 AND (c.status='done' OR (c.id=? AND c.status='processing'))
    AND COALESCE(c.summary,'') != ?
    AND NOT EXISTS(SELECT 1 FROM call_events e WHERE e.call_id=c.id AND e.type='safety')
    AND NOT EXISTS(SELECT 1 FROM safety_events e WHERE e.call_id=c.id)
    ORDER BY c.started_at,c.id`).all(elderId, processingId, SAFETY_SUMMARY_LINE) as Row[];
  return rows.map(row => {
    // Invalid/missing stored inputs cannot masquerade as an empty successful analysis.
    if (!row.ended_at || !row.utterances_json || !['en','zh'].includes(row.language)) throw fail('INPUT_UNAVAILABLE');
    const utterances = JSON.parse(row.utterances_json) as Utterance[];
    const call = parseCall({ elderId, callId: row.id, startedAt: row.started_at, isSimulated: false,
      utterances: utterances.map(u => ({ speaker: u.speaker, text: u.text, startMs: u.startMs, endMs: u.endMs })) });
    return { call, endedAt: row.ended_at, language: row.language, utterances };
  });
}
function validate(result: SuccessfulAnalysis, entry: CorpusCall, history: EmbeddedItem[]): boolean {
  try {
    const call = entry.call, p = result.provenance, settings = LIVE_DETECTOR_SETTINGS;
    if (result.status !== 'ok' || result.callId !== call.callId || result.elderId !== call.elderId
      || result.persistenceKey !== `call_${fingerprint([call.elderId,call.callId])}`
      || p.isSimulated !== false || p.detectorVersion !== '1.0.0' || p.promptVersion !== 'remi-items-v1'
      || p.embeddingModel !== settings.embeddingModel || p.embeddingDimensions !== settings.embeddingDimensions || p.threshold !== settings.threshold
      || (p.extractionModel !== settings.extractionModel && !(p.extractionModel === null && !call.utterances.some(u => u.speaker === 'caller' && u.text.trim())))
      || !Array.isArray(result.historyUpdates) || result.historyUpdates.length) return false;
    const items = parseHistory(result.items) as EmbeddedItem[];
    if (items.some(item => item.elderId !== call.elderId || item.callId !== call.callId || item.startedAt !== call.startedAt || item.isSimulated !== false
      || item.embedding == null || item.embeddingModel !== p.embeddingModel || item.embeddingDimensions !== p.embeddingDimensions
      || item.extractionModel !== p.extractionModel || item.promptVersion !== p.promptVersion || item.id !== makeItemId(item)
      || call.utterances[item.sourceTurnIndex]?.speaker !== 'caller' || !call.utterances[item.sourceTurnIndex].text.includes(item.quote)
      || (item.elicitation === 'prompted' && call.utterances[item.promptTurnIndex!]?.speaker !== 'agent'))) return false;
    const expected = classifyCandidates(findCandidates(items, history), { threshold: settings.threshold });
    return JSON.stringify(expected.matches) === JSON.stringify(result.matches) && JSON.stringify(expected.counts) === JSON.stringify(result.counts);
  } catch { return false; }
}
function cached(db: Database.Database, corpus: CorpusCall[]): SuccessfulAnalysis[] {
  const history: EmbeddedItem[] = [], results: SuccessfulAnalysis[] = [];
  const read = db.prepare('SELECT * FROM live_detector_results WHERE call_id=?');
  for (let i = 0; i < corpus.length; i++) {
    const row = read.get(corpus[i].call.callId) as Stored | undefined;
    if (!row || row.settings_hash !== SETTINGS_HASH || row.prefix_hash !== fingerprint(corpus.slice(0,i+1)) || row.history_hash !== fingerprint(history)) break;
    try {
      const result = JSON.parse(row.result_json) as SuccessfulAnalysis;
      if (!validate(result, corpus[i], history)) break;
      results.push(result); history.push(...result.items);
    } catch { break; }
  }
  return results;
}
/** Read-only: invalid prior evidence makes downstream results unavailable, never zero. */
export function liveResults(db: Database.Database, elderId: string): { corpus: CorpusCall[]; results: SuccessfulAnalysis[] } {
  try {
    const corpus = corpusFor(db, elderId);
    return { corpus, results: consent(db, elderId).speechTrends ? cached(db, corpus) : [] };
  } catch { return { corpus: [], results: [] }; }
}
export function buildLiveRepeatAnalysis(db: Database.Database, elderId: string, sharing: { summaries: boolean; speechTrends: boolean }) {
  if (!sharing.speechTrends) return undefined;
  const { corpus, results } = liveResults(db, elderId);
  return repeatAnalysisView(corpus, results, sharing);
}

/** Called on the serial post-call queue. No settings override: these are the evaluated settings. */
export async function analyzeLiveRepeats(db: Database.Database, callId: string, options: Pick<OpenAIOptions, 'apiKey' | 'fetchImpl' | 'maxRetries' | 'timeoutMs'> = {}): Promise<void> {
  try {
    const target = db.prepare('SELECT elder_id,is_simulated FROM calls WHERE id=?').get(callId) as { elder_id: string; is_simulated: number } | undefined;
    if (!target || target.is_simulated !== 0) return;
    const elderId = target.elder_id, sharing = consent(db, elderId);
    if (!sharing.summaries || !sharing.speechTrends) return;
    const corpus = corpusFor(db, elderId, callId);
    if (!corpus.some(c => c.call.callId === callId)) return;
    const inputHash = fingerprint(corpus), results = cached(db, corpus), history = results.flatMap(r => r.items);
    const initialCache = fingerprint(db.prepare('SELECT * FROM live_detector_results WHERE call_id IN (SELECT id FROM calls WHERE elder_id=?) ORDER BY call_id').all(elderId));
    const check = () => {
      const current = consent(db, elderId);
      if (!current.summaries || !current.speechTrends) throw fail('CONSENT_CHANGED');
      if (fingerprint(corpusFor(db, elderId, callId)) !== inputHash) throw fail('INPUT_CHANGED');
      if (fingerprint(db.prepare('SELECT * FROM live_detector_results WHERE call_id IN (SELECT id FROM calls WHERE elder_id=?) ORDER BY call_id').all(elderId)) !== initialCache) throw fail('CACHE_CHANGED');
    };
    const provider = options.fetchImpl ?? globalThis.fetch;
    const guardedFetch: typeof fetch = async (url, init) => { check(); return provider(url, init); };
    const pending: { result: SuccessfulAnalysis; prefixHash: string; historyHash: string }[] = [];
    for (let i = results.length; i < corpus.length; i++) {
      check(); const historyHash = fingerprint(history);
      const result = await analyzeCall({ call: corpus[i].call, history, processingAllowed: true }, { ...options, ...LIVE_DETECTOR_SETTINGS, fetchImpl: guardedFetch });
      if (result.status !== 'ok' || !validate(result, corpus[i], history)) throw fail('ANALYSIS_UNAVAILABLE');
      pending.push({ result, prefixHash: fingerprint(corpus.slice(0,i+1)), historyHash }); history.push(...result.items);
    }
    db.transaction(() => {
      check();
      const write = db.prepare(`INSERT INTO live_detector_results(call_id,prefix_hash,history_hash,settings_hash,result_json,analyzed_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(call_id) DO UPDATE SET prefix_hash=excluded.prefix_hash,history_hash=excluded.history_hash,settings_hash=excluded.settings_hash,result_json=excluded.result_json,analyzed_at=excluded.analyzed_at`);
      for (const { result, prefixHash, historyHash } of pending) write.run(result.callId, prefixHash, historyHash, SETTINGS_HASH, JSON.stringify(result), new Date().toISOString());
    }).immediate();
  } catch (error) {
    if (error instanceof Error && /^LIVE_REPEATS_[A-Z_]+$/.test(error.message)) throw error;
    throw fail('VALIDATION_FAILED');
  }
}

/** Seven-day marker: only unprompted stories, unlike the all-history story/question panel. */
export function recentStoryCounts(results: SuccessfulAnalysis[], days: number): Map<string, number> {
  const history = results.flatMap(r => r.items);
  return new Map(results.map(result => {
    const current = result.items.filter(item => item.kind === 'story' && item.elicitation === 'unprompted');
    const startedAt = current[0]?.startedAt;
    if (!startedAt) return [result.callId, 0];
    const cutoff = Date.parse(startedAt) - days * 86400000;
    const recent = history.filter(item => Date.parse(item.startedAt) >= cutoff);
    const { counts } = classifyCandidates(findCandidates(current, recent), { threshold: LIVE_DETECTOR_SETTINGS.threshold });
    return [result.callId, counts.total];
  }));
}
