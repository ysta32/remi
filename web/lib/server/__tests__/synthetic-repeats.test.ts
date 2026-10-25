import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { closeDb } from '@/db/client';
import { buildTimeline } from '../timeline';
import { importSyntheticTranscripts } from '../synthetic-import';
import { generateBundle } from '../../../../synthetic/src/generate.mjs';
import { writeBundle } from '../../../../synthetic/src/write.mjs';
import type { Call, OpenAIOptions } from '../../../../detector/src/index.mjs';
const runner = await import('../synthetic-repeats').catch(() => null);
let root: string, inputDir: string, databasePath: string, db: Database.Database;
const previousPath = process.env.DATABASE_PATH;
const bundle = generateBundle();
const calls = bundle.calls as (Call & { endedAt: string; language: string })[];
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'remi-repeats-'));
  inputDir = path.join(root, 'source'); databasePath = path.join(root, 'demo.sqlite');
  await writeBundle(bundle, inputDir);
  await importSyntheticTranscripts({ inputDir, databasePath, apply: true });
  db = new Database(databasePath); db.pragma('foreign_keys = ON');
  process.env.DATABASE_PATH = databasePath;
  vi.stubGlobal('fetch', () => { throw new Error('No real network in tests'); });
});
afterEach(() => {
  closeDb(); db?.close(); vi.unstubAllGlobals();
  if (previousPath === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previousPath;
  fs.rmSync(root, { recursive: true, force: true });
});
async function run(apply = true, options: OpenAIOptions & { threshold?: number; onProgress?: (e: { completed: number }) => void } = {}) {
  expect(runner?.analyzeSyntheticRepeats, 'explicit synthetic detector runner exists').toBeTypeOf('function');
  return runner!.analyzeSyntheticRepeats({ inputDir, databasePath, apply }, options);
}
// Only OpenAI HTTP is replaced. Extraction grounding, vector validation, comparison,
// classification, history management, SQLite and timeline serialization are production code.
function transport(config: { sparse?: boolean; empty?: boolean; before?: (request: number) => void; failAt?: number } = {}) {
  let request = 0, extraction = 0;
  const bodies: unknown[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    request++; config.before?.(request);
    if (request === config.failAt) return new Response('', { status: 400 });
    const body = JSON.parse(init!.body as string); bodies.push(body);
    if (String(url).endsWith('/responses')) {
      const { utterances } = JSON.parse(body.input[0].content) as { utterances: { speaker: string; text: string }[] };
      const selected = utterances.map((u, i) => ({ ...u, i })).filter(u => u.speaker === 'caller').slice(0, 3);
      const active = !config.empty && (!config.sparse || extraction === 0 || extraction === calls.length - 1);
      extraction++;
      const items = active ? selected.map((u, index) => ({ kind: index === 2 ? 'question' : 'story', summary: `Evidence ${index}`, quote: u.text.slice(0, 50), sourceTurnIndex: u.i, elicitation: ['unprompted', 'prompted', 'uncertain'][index], promptTurnIndex: index === 1 ? utterances.slice(0, u.i).findLastIndex(t => t.speaker === 'agent') : null })) : [];
      return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ items }) }] }] });
    }
    return Response.json({ model: body.model, data: body.input.map((summary: string, index: number) => ({ index, embedding: Array.from({ length: body.dimensions }, (_, n) => n === Number(summary.slice(-1)) ? 1 : 0) })) });
  };
  return { fetchImpl, bodies };
}
function options(t = transport()): OpenAIOptions { return { apiKey: 'offline-test-key', fetchImpl: t.fetchImpl, maxRetries: 0 }; }
function rows() { return db.prepare('SELECT * FROM detector_results ORDER BY call_id').all(); }
function legacy() { return ['topics','call_markers','baselines','nudges','fun_facts','calls','elders'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }

describe('explicit chronological synthetic repeat analysis', () => {
  it('dry-run validates without credentials, network, migration, or writes; never reads planted files', async () => {
    db.exec('DROP TABLE IF EXISTS detector_results');
    fs.rmSync(path.join(inputDir, 'ground-truth'), { recursive: true });
    fs.rmSync(path.join(inputDir, 'detector-inputs'), { recursive: true });
    const bytes = fs.readFileSync(databasePath);
    expect(await run(false)).toMatchObject({ dryRun: true, callCount: 12 });
    expect(fs.readFileSync(databasePath)).toEqual(bytes);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='detector_results'").get()).toBeUndefined();
  });
  it('persists real successful detector results atomically, counts labels/kinds and exposes only consented evidence', async () => {
    const before = legacy(), t = transport(), progress: number[] = [];
    expect(await run(true, { ...options(t), onProgress: e => progress.push(e.completed) })).toMatchObject({ dryRun: false, analyzedCallCount: 12, reused: false });
    expect(progress).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]); expect(rows()).toHaveLength(12); expect(legacy()).toEqual(before);
    const view = buildTimeline(calls[0].elderId)!.repeatAnalysis!;
    expect(view).toMatchObject({ scope: 'all_prior_calls', status: 'complete', analyzedCallCount: 12, totalCallCount: 12, counts: { total: 33, unprompted: 11, prompted: 11, uncertain: 11, stories: 22, questions: 11 }, provenance: { extractionModel: 'gpt-6.1-sol', embeddingModel: 'text-embedding-3-small', threshold: 0.85, detectorVersion: '1.0.0' } });
    expect(new Set(view.matches.map(m => m.label))).toEqual(new Set(['Unprompted repeat','Prompted retelling','Uncertain']));
    expect(view.matches.every(m => m.quote && m.priorQuote && m.summary && m.isSimulated && Date.parse(m.priorStartedAt) < Date.parse(m.startedAt))).toBe(true);
    const publicJson = JSON.stringify(view), requests = JSON.stringify(t.bodies);
    for (const forbidden of ['embeddingDimensions','embedding":','persistenceKey','sourceTurnIndex','utterances','incidentId','planted','split']) expect(publicJson).not.toContain(forbidden);
    for (const forbidden of ['incidentId','occurrenceId','planted_unreviewed','splits','familyId']) expect(requests).not.toContain(forbidden);
    for (const body of t.bodies as { input: { content: string }[] }[]) if (Array.isArray(body.input) && typeof body.input[0] === 'object') {
      const payload = JSON.parse(body.input[0].content);
      expect(Object.keys(payload)).toEqual(['utterances']);
      for (const turn of payload.utterances) expect(Object.keys(turn).sort()).toEqual(['endMs','speaker','startMs','text']);
    }
    db.prepare('UPDATE consents SET elder_summaries=0 WHERE elder_id=?').run(calls[0].elderId);
    expect(buildTimeline(calls[0].elderId)!.repeatAnalysis!.matches.every(m => m.quote === null && m.priorQuote === null && m.summary === null)).toBe(true);
    db.prepare('UPDATE consents SET fam_speech_trends=0 WHERE elder_id=?').run(calls[0].elderId);
    expect(buildTimeline(calls[0].elderId)).not.toHaveProperty('repeatAnalysis');
  });
  it('uses all earlier actual extracted items beyond seven days', async () => {
    await run(true, options(transport({ sparse: true })));
    const view = buildTimeline(calls[0].elderId)!.repeatAnalysis!;
    expect(view.counts.total).toBe(3);
    expect(view.matches.every(m => m.callId === calls.at(-1)!.callId && m.priorCallId === calls[0].callId)).toBe(true);
  });
  it('distinguishes complete zero from unavailable and reuses only a complete unchanged batch', async () => {
    await run(true, options(transport({ empty: true })));
    expect(buildTimeline(calls[0].elderId)!.repeatAnalysis).toMatchObject({ status: 'complete', counts: { total: 0 }, matches: [] });
    expect(await run(true)).toMatchObject({ reused: true, analyzedCallCount: 12 });
    const prior = rows();
    await expect(run(true, { ...options(transport({ failAt: 3 })), extractionModel: 'different-model' })).rejects.toThrow('SYNTHETIC_REPEATS_');
    expect(rows()).toEqual(prior);
  });
  it('missing prior result forces a full replay, with no cached downstream history', async () => {
    await run(true, options());
    db.prepare('DELETE FROM detector_results WHERE call_id=?').run(calls[0].callId);
    await run(true, options(transport({ empty: true })));
    expect(buildTimeline(calls[0].elderId)!.repeatAnalysis).toMatchObject({ status: 'complete', counts: { total: 0 } });
  });
  it('provider failure midway preserves the entire previous successful batch', async () => {
    await run(true, options()); const before = rows();
    await expect(run(true, { ...options(transport({ failAt: 9 })), threshold: 0.9 })).rejects.toThrow('SYNTHETIC_REPEATS_');
    expect(rows()).toEqual(before);
  });
  it.each(['consent','transcript','source'])('rechecks %s before every request, aborting without partial persistence', async change => {
    const t = transport({ before: n => {
      if (n !== 1) return;
      if (change === 'consent') db.prepare('UPDATE consents SET elder_speech_trends=0').run();
      if (change === 'transcript') db.prepare("UPDATE calls SET utterances_json='[]' WHERE id=?").run(calls[0].callId);
      if (change === 'source') fs.appendFileSync(path.join(inputDir, 'profile.json'), ' ');
    } });
    await expect(run(true, options(t))).rejects.toThrow('SYNTHETIC_REPEATS_');
    expect(t.bodies).toHaveLength(1); expect(rows()).toEqual([]);
  });
  it('rechecks final persistence after the last response', async () => {
    const t = transport({ empty: true, before: n => { if (n === 12) db.prepare('UPDATE consents SET fam_summaries=0').run(); } });
    await expect(run(true, options(t))).rejects.toThrow('SYNTHETIC_REPEATS_'); expect(rows()).toEqual([]);
  });
  it.each(['transcript','date','simulation','status','elder','missing'])('rejects %s drift before provider requests', async change => {
    if (change === 'transcript') db.prepare("UPDATE calls SET utterances_json='[]' WHERE id=?").run(calls[0].callId);
    if (change === 'date') db.prepare("UPDATE calls SET started_at='2026-01-01T00:00:00.000Z' WHERE id=?").run(calls[0].callId);
    if (change === 'simulation') db.prepare('UPDATE calls SET is_simulated=0 WHERE id=?').run(calls[0].callId);
    if (change === 'status') db.prepare("UPDATE calls SET status='processing' WHERE id=?").run(calls[0].callId);
    if (change === 'elder') db.prepare('UPDATE elders SET is_simulated=0').run();
    if (change === 'missing') db.prepare('DELETE FROM calls WHERE id=?').run(calls[0].callId);
    const t = transport(); await expect(run(true, options(t))).rejects.toThrow('SYNTHETIC_REPEATS_'); expect(t.bodies).toEqual([]);
  });
  it('ignores stale hashes, settings mixtures, malformed results and invalid previous links', async () => {
    await run(true, options()); const original = rows() as { call_id: string; result_json: string }[];
    db.prepare("UPDATE detector_results SET settings_hash='other' WHERE call_id=?").run(calls[1].callId);
    expect(buildTimeline(calls[0].elderId)).not.toHaveProperty('repeatAnalysis');
    await run(true, options());
    const corrupt = JSON.parse(original.find(r => r.call_id === calls[1].callId)!.result_json); corrupt.matches[0].matchedCallId = 'foreign-or-missing';
    db.prepare('UPDATE detector_results SET result_json=? WHERE call_id=?').run(JSON.stringify(corrupt), calls[1].callId);
    const partial = buildTimeline(calls[0].elderId)!.repeatAnalysis!;
    expect(partial.status).toBe('partial'); expect(partial.matches.some(m => m.priorCallId === 'foreign-or-missing')).toBe(false);
    db.prepare("UPDATE calls SET utterances_json='[]' WHERE id=?").run(calls[0].callId);
    expect(buildTimeline(calls[0].elderId)).not.toHaveProperty('repeatAnalysis');
  });
  it('deleted earlier calls invalidate corpus results and cascade their stored result', async () => {
    await run(true, options()); db.prepare('DELETE FROM calls WHERE id=?').run(calls[0].callId);
    expect(rows()).toHaveLength(11); expect(buildTimeline(calls[0].elderId)).not.toHaveProperty('repeatAnalysis');
  });
  it('rejects unsafe absolute paths and symlinked existing databases', async () => {
    const link = path.join(root, 'link.sqlite'); fs.symlinkSync(databasePath, link);
    for (const unsafe of [link, 'relative.sqlite', `${root}/../demo.sqlite`, path.join(root, 'missing.sqlite')]) {
      await expect(runner!.analyzeSyntheticRepeats({ inputDir, databasePath: unsafe })).rejects.toThrow();
    }
  });
});


describe('synthetic repeat CLI', () => {
  it('honors established team model/dimension env names over standalone aliases for cache reuse', async () => {
    await run(true, { ...options(), extractionModel: 'team-extractor', embeddingModel: 'team-embedding', embeddingDimensions: 3 });
    const cli = path.resolve('scripts/analyze-synthetic-repeats.ts'), tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
    const result = spawnSync(process.execPath, [tsx,cli,'--input',inputDir,'--database',databasePath,'--apply'], {
      encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'test', OPENAI_EXTRACT_MODEL: 'team-extractor', OPENAI_EXTRACTION_MODEL: 'ignored-extractor', OPENAI_EMBED_MODEL: 'team-embedding', EMBEDDING_MODEL: 'ignored-embedding', OPENAI_EMBEDDING_MODEL: 'ignored-long-alias', EMBEDDING_DIMENSIONS: '3', OPENAI_EMBEDDING_DIMENSIONS: '7' },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ reused: true, analyzedCallCount: 12 });
  });

  it('requires explicit paths, supports no-key dry runs and sanitizes errors', () => {
    const cli = path.resolve('scripts/analyze-synthetic-repeats.ts'), tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
    const invoke = (args: string[]) => spawnSync(process.execPath, [tsx, cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'test' } });
    const help = invoke(['--help']); expect(help.status).toBe(0); expect(help.stdout).toContain('--apply');
    const dry = invoke(['--input', inputDir, '--database', databasePath]);
    expect(dry.status).toBe(0); expect(JSON.parse(dry.stdout)).toMatchObject({ dryRun: true, callCount: 12 });
    for (const args of [[], ['--input',inputDir], ['--database',databasePath], ['--input',inputDir,'--database',databasePath,'--input',inputDir], ['--unknown']]) {
      const result = invoke(args); expect(result.status).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr).toMatch(/^SYNTHETIC_REPEATS_[A-Z_]+\n$/);
    }
    const noKey = invoke(['--input',inputDir,'--database',databasePath,'--apply']);
    expect(noKey.status).toBe(1); expect(noKey.stderr).toBe('SYNTHETIC_REPEATS_ANALYSIS_UNAVAILABLE\n'); expect(rows()).toEqual([]);
  });
});
