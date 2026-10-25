import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { analyzeCall, type Call, type OpenAIOptions, type EmbeddedItem } from '../../../detector/src/index.mjs';
import { loadTranscriptSource } from '../../../synthetic/src/read.mjs';
import { toDetectorCall } from '../../../synthetic/src/contracts.mjs';
import { migrate } from '../../db/migrate';
import { DEFAULT_EXTRACT_MODEL } from '../analysis/llm';
import { effectiveConsent, type ConsentRow } from './consent';
import { corpusFingerprint, readDetectorCorpus, settingsFingerprint, validatedResults, type CorpusCall, type DetectorSettings, type SuccessfulAnalysis } from './detector-results';

export interface SyntheticRepeatInput { inputDir: string; databasePath: string; apply?: boolean }
export type SyntheticRepeatOptions = OpenAIOptions & { threshold?: number; onProgress?: (event: { completed: number; total: number; callId: string; repeatCount: number }) => void };
const fail = (code: string) => new Error(`SYNTHETIC_REPEATS_${code}`);
function absolute(value: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0\\]/.test(value) || value.slice(path.parse(value).root.length).split(path.sep).some(p => !p || p === '.' || p === '..')) throw fail('PATH_UNSAFE');
  return value;
}
function databaseIdentity(filename: string): () => void {
  const identities: { name: string; dev: number; ino: number; file: boolean }[] = [];
  for (let name = filename; ; name = path.dirname(name)) {
    const stat = fs.lstatSync(name), file = name === filename;
    if (stat.isSymbolicLink() || (file ? !stat.isFile() : !stat.isDirectory())) throw fail('PATH_UNSAFE');
    identities.push({ name, dev: stat.dev, ino: stat.ino, file });
    if (name === path.dirname(name)) break;
  }
  return () => {
    for (const expected of identities) {
      const stat = fs.lstatSync(expected.name);
      if (stat.isSymbolicLink() || (expected.file ? !stat.isFile() : !stat.isDirectory()) || stat.dev !== expected.dev || stat.ino !== expected.ino) throw fail('PATH_UNSAFE');
    }
    for (const suffix of ['-wal','-shm','-journal']) {
      try { const stat = fs.lstatSync(`${filename}${suffix}`); if (!stat.isFile() || stat.isSymbolicLink()) throw fail('PATH_UNSAFE'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  };
}
function requireConsent(db: Database.Database, elderId: string): void {
  const consent = effectiveConsent(db.prepare('SELECT * FROM consents WHERE elder_id=?').get(elderId) as ConsentRow | undefined);
  if (!consent.speechTrends || !consent.summaries) throw fail('CONSENT_REQUIRED');
}
function settings(options: SyntheticRepeatOptions): DetectorSettings {
  const resolved = { extractionModel: options.extractionModel ?? DEFAULT_EXTRACT_MODEL, embeddingModel: options.embeddingModel ?? 'text-embedding-3-small', embeddingDimensions: options.embeddingDimensions ?? 1536, threshold: options.threshold ?? 0.85 };
  if (typeof resolved.extractionModel !== 'string' || !resolved.extractionModel.trim() || resolved.extractionModel.length > 200 || typeof resolved.embeddingModel !== 'string' || !resolved.embeddingModel.trim() || !Number.isInteger(resolved.embeddingDimensions) || resolved.embeddingDimensions < 1 || !Number.isFinite(resolved.threshold) || resolved.threshold < 0 || resolved.threshold > 1) throw fail('OPTIONS_INVALID');
  return resolved;
}

/** Explicit isolated fictional processing only. Library never reads credentials/environment. */
export async function analyzeSyntheticRepeats({ inputDir, databasePath, apply = false }: SyntheticRepeatInput, options: SyntheticRepeatOptions = {}) {
  let db: Database.Database | undefined;
  try {
    if (typeof apply !== 'boolean' || !options || typeof options !== 'object' || Array.isArray(options)) throw fail('OPTIONS_INVALID');
    absolute(inputDir); absolute(databasePath);
    const checkIdentity = databaseIdentity(databasePath); checkIdentity();
    const source = await loadTranscriptSource(inputDir);
    const expected: CorpusCall[] = source.calls.map((call: Call & { endedAt: string; language: string; utterances: CorpusCall['utterances'] }) => ({ call: toDetectorCall(call) as Call, endedAt: call.endedAt, language: call.language, utterances: call.utterances })).sort((a: CorpusCall,b: CorpusCall) => a.call.startedAt.localeCompare(b.call.startedAt) || a.call.callId.localeCompare(b.call.callId));
    const corpusHash = corpusFingerprint(expected), elderId = source.profile.elderId as string, configuration = settings(options), settingsHash = settingsFingerprint(configuration);
    checkIdentity(); db = new Database(databasePath, { readonly: !apply, fileMustExist: true }); checkIdentity();
    const database = db;
    const checkDatabase = () => {
      checkIdentity(); requireConsent(database, elderId);
      if (corpusFingerprint(readDetectorCorpus(database, elderId)) !== corpusHash) throw fail('CORPUS_CHANGED');
    };
    const checkCurrent = async () => {
      const current = await loadTranscriptSource(inputDir);
      const currentCalls = current.calls.map((call: Call & { endedAt: string; language: string; utterances: CorpusCall['utterances'] }) => ({ call: toDetectorCall(call) as Call, endedAt: call.endedAt, language: call.language, utterances: call.utterances })).sort((a: CorpusCall,b: CorpusCall) => a.call.startedAt.localeCompare(b.call.startedAt) || a.call.callId.localeCompare(b.call.callId));
      if (current.profile.elderId !== elderId || corpusFingerprint(currentCalls) !== corpusHash) throw fail('SOURCE_CHANGED');
      checkDatabase();
    };
    checkDatabase();
    const summary = { dryRun: !apply, isSimulated: true, elderId, callCount: expected.length, corpusHash, settingsHash };
    if (!apply) return summary;
    // No migration or writes until the named corpus and current sharing choices are validated.
    db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000'); migrate(db);
    const existing = validatedResults(db, expected, settingsHash);
    if (existing.length === expected.length) { await checkCurrent(); return { ...summary, analyzedCallCount: existing.length, reused: true }; }
    const fetchProvider = options.fetchImpl ?? globalThis.fetch;
    const guardedFetch: typeof fetch = async (url, init) => { await checkCurrent(); return fetchProvider(url, init); };
    const history: EmbeddedItem[] = [], results: SuccessfulAnalysis[] = [];
    for (const entry of expected) {
      await checkCurrent();
      const result = await analyzeCall({ call: entry.call, history, processingAllowed: true }, { ...options, ...configuration, fetchImpl: guardedFetch });
      if (result.status !== 'ok') throw fail('ANALYSIS_UNAVAILABLE');
      results.push(result); history.push(...result.items);
      options.onProgress?.({ completed: results.length, total: expected.length, callId: result.callId, repeatCount: result.counts.total });
    }
    await checkCurrent();
    // IMMEDIATE locks out concurrent DB mutations between the last check and the batch write.
    db.transaction(() => {
      checkDatabase();
      const insert = database.prepare(`INSERT INTO detector_results(call_id,corpus_hash,settings_hash,result_json,analyzed_at) VALUES (?,?,?,?,?) ON CONFLICT(call_id) DO UPDATE SET corpus_hash=excluded.corpus_hash,settings_hash=excluded.settings_hash,result_json=excluded.result_json,analyzed_at=excluded.analyzed_at`);
      const at = new Date().toISOString();
      for (const result of results) insert.run(result.callId, corpusHash, settingsHash, JSON.stringify(result), at);
    }).immediate();
    return { ...summary, analyzedCallCount: results.length, reused: false };
  } catch (error) {
    if (error instanceof Error && /^SYNTHETIC_REPEATS_[A-Z_]+$/.test(error.message)) throw error;
    throw fail('VALIDATION_FAILED');
  } finally { db?.close(); }
}
