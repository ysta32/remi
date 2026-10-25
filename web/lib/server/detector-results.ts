// Separate standalone detector storage. Never writes legacy topics or markers.
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { classifyCandidates, findCandidates, makeItemId, parseHistory, type AnalysisResult, type Call, type EmbeddedItem } from '../../../detector/src/index.mjs';
import { toDetectorCall } from '../../../synthetic/src/contracts.mjs';
import type { RepeatAnalysisView, Utterance } from '../types';

export type SuccessfulAnalysis = Extract<AnalysisResult, { status: 'ok' }>;
export interface CorpusCall { call: Call; endedAt: string; language: string; utterances: Utterance[] }
export interface DetectorSettings { extractionModel: string; embeddingModel: string; embeddingDimensions: number; threshold: number }
export const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function settingsFingerprint(settings: DetectorSettings): string {
  return fingerprint({ detectorVersion: '1.0.0', promptVersion: 'remi-items-v1', ...settings });
}
export function corpusFingerprint(corpus: CorpusCall[]): string { return fingerprint(corpus); }

/** Full corpus inputs are read internally only, to reject changed prior evidence. */
export function readDetectorCorpus(db: Database.Database, elderId: string): CorpusCall[] {
  const elder = db.prepare('SELECT is_simulated FROM elders WHERE id=?').get(elderId) as { is_simulated: number } | undefined;
  if (elder?.is_simulated !== 1) throw new Error('SYNTHETIC_REPEATS_CORPUS_INVALID');
  const rows = db.prepare(`SELECT id,elder_id,started_at,ended_at,language,status,is_simulated,utterances_json FROM calls WHERE elder_id=? ORDER BY started_at,id`).all(elderId) as { id: string; elder_id: string; started_at: string; ended_at: string | null; language: string; status: string; is_simulated: number; utterances_json: string | null }[];
  if (!rows.length) throw new Error('SYNTHETIC_REPEATS_CORPUS_INVALID');
  return rows.map(row => {
    if (row.status !== 'done' || row.is_simulated !== 1 || !row.ended_at || !row.utterances_json || !['en','zh'].includes(row.language)) throw new Error('SYNTHETIC_REPEATS_CORPUS_INVALID');
    const utterances = JSON.parse(row.utterances_json) as Utterance[];
    const call = toDetectorCall({ elderId: row.elder_id, callId: row.id, startedAt: row.started_at, isSimulated: true, utterances }) as Call;
    return { call, endedAt: row.ended_at, language: row.language, utterances };
  });
}
export function hasDetectorResults(db: Database.Database): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='detector_results'").get();
}
interface StoredResult { call_id: string; corpus_hash: string; settings_hash: string; result_json: string }

/** Revalidate stored successful results against actual call evidence and earlier saved items. */
export function validatedResults(db: Database.Database, corpus: CorpusCall[], settingsHash?: string): SuccessfulAnalysis[] {
  if (!hasDetectorResults(db)) return [];
  const hash = corpusFingerprint(corpus);
  const rows = db.prepare('SELECT r.call_id,r.corpus_hash,r.settings_hash,r.result_json FROM detector_results r JOIN calls c ON c.id=r.call_id WHERE c.elder_id=?').all(corpus[0].call.elderId) as StoredResult[];
  const current = rows.filter(row => row.corpus_hash === hash);
  if (!current.length || new Set(current.map(row => row.settings_hash)).size !== 1 || (settingsHash && current[0].settings_hash !== settingsHash)) return [];
  const byCall = new Map(current.map(row => [row.call_id, row]));
  const history: EmbeddedItem[] = [], valid: SuccessfulAnalysis[] = [];
  for (const entry of corpus) {
    const row = byCall.get(entry.call.callId); if (!row) continue;
    try {
      const result = JSON.parse(row.result_json) as SuccessfulAnalysis;
      const p = result.provenance, call = entry.call;
      if (result.status !== 'ok' || result.elderId !== call.elderId || result.callId !== call.callId
          || result.persistenceKey !== `call_${fingerprint([call.elderId,call.callId])}`
          || p.detectorVersion !== '1.0.0' || p.promptVersion !== 'remi-items-v1' || p.isSimulated !== true
          || typeof p.extractionModel !== 'string' || !p.extractionModel.trim()
          || typeof p.embeddingModel !== 'string' || !p.embeddingModel.trim()
          || !Number.isInteger(p.embeddingDimensions) || p.embeddingDimensions < 1
          || settingsFingerprint({ extractionModel: p.extractionModel, embeddingModel: p.embeddingModel, embeddingDimensions: p.embeddingDimensions, threshold: p.threshold }) !== row.settings_hash
          || !Array.isArray(result.historyUpdates) || result.historyUpdates.length !== 0) continue;
      const items = parseHistory(result.items) as EmbeddedItem[];
      if (items.some(item => {
        const turn = call.utterances[item.sourceTurnIndex];
        return item.elderId !== call.elderId || item.callId !== call.callId || item.startedAt !== call.startedAt || item.isSimulated !== true
          || item.embedding == null || item.embeddingModel !== p.embeddingModel || item.embeddingDimensions !== p.embeddingDimensions
          || item.extractionModel !== p.extractionModel || item.promptVersion !== p.promptVersion || item.id !== makeItemId(item)
          || turn?.speaker !== 'caller' || !turn.text.includes(item.quote)
          || (item.elicitation === 'prompted' && call.utterances[item.promptTurnIndex!]?.speaker !== 'agent');
      })) continue;
      const expected = classifyCandidates(findCandidates(items, history), { threshold: p.threshold });
      if (JSON.stringify(expected.matches) !== JSON.stringify(result.matches) || JSON.stringify(expected.counts) !== JSON.stringify(result.counts)) continue;
      valid.push({ ...result, items }); history.push(...items);
    } catch { /* Corrupt/stale evidence is unavailable, never a zero-count success. */ }
  }
  return valid;
}

/** Only the allowlisted view leaves this module. Raw results and vectors stay server-side. */
export function buildRepeatAnalysis(db: Database.Database, elderId: string, consent: { speechTrends: boolean; summaries: boolean }): RepeatAnalysisView | undefined {
  if (!consent.speechTrends || !hasDetectorResults(db)) return undefined;
  try {
    const corpus = readDetectorCorpus(db, elderId), results = validatedResults(db, corpus);
    if (!results.length) return undefined;
    const counts = { total: 0, unprompted: 0, prompted: 0, uncertain: 0, stories: 0, questions: 0 };
    const items = new Map(results.flatMap(result => result.items).map(item => [item.id,item]));
    const matches: RepeatAnalysisView['matches'] = [];
    for (const result of results) for (const match of result.matches) {
      if (!match.isRepeat) continue;
      const item = items.get(match.itemId), prior = items.get(match.matchedItemId!);
      if (!item || !prior || prior.callId !== match.matchedCallId || prior.elderId !== elderId || Date.parse(prior.startedAt) >= Date.parse(item.startedAt) || match.similarity === null) continue;
      counts.total++; counts[item.elicitation]++; counts[item.kind === 'story' ? 'stories' : 'questions']++;
      matches.push({ callId: item.callId, startedAt: item.startedAt, priorCallId: prior.callId, priorStartedAt: prior.startedAt, kind: item.kind,
        label: { unprompted: 'Unprompted repeat', prompted: 'Prompted retelling', uncertain: 'Uncertain' }[item.elicitation] as RepeatAnalysisView['matches'][number]['label'],
        similarity: match.similarity, summary: consent.summaries ? item.summary : null, quote: consent.summaries ? item.quote : null,
        priorQuote: consent.summaries ? prior.quote : null, isSimulated: item.isSimulated || prior.isSimulated });
    }
    const p = results[0].provenance;
    return { scope: 'all_prior_calls', status: results.length === corpus.length ? 'complete' : 'partial', analyzedCallCount: results.length, totalCallCount: corpus.length, counts,
      provenance: { extractionModel: p.extractionModel, embeddingModel: p.embeddingModel, threshold: p.threshold, detectorVersion: p.detectorVersion }, matches };
  } catch { return undefined; }
}
