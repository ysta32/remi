import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { closeDb } from '@/db/client';
import { buildTimeline } from '@/lib/server/timeline';
import { computeMarkers } from '@/lib/markers';
import { markerMeta, MARKER_KEYS } from '@/lib/markers/meta';
import { ABS_SPREAD_FLOOR, BASELINE_N, MIN_SCALE } from '@/lib/analysis/config';
import { buildBaseline, signedZ } from '@/lib/analysis/stats';
import { generateBundle } from '../../../synthetic/src/generate.mjs';
import { writeBundle } from '../../../synthetic/src/write.mjs';
import type { Lang, Utterance } from '@/lib/types';
const importer = await import('@/lib/server/synthetic-import').catch(() => null);
const helper = await import('@/lib/synthetic-demo').catch(() => null);
let root: string, inputDir: string, databasePath: string;
type TestBundle = {
  profile: { elderId: string; name: string; biography: string; family: { name: string; relationship: string }[] };
  calls: { callId: string; elderId: string; startedAt: string; endedAt: string; language: Lang; utterances: Utterance[] }[];
};
const bundle = generateBundle() as TestBundle, savedPath = process.env.DATABASE_PATH;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'remi-import-'));
  inputDir = path.join(root, 'source'); databasePath = path.join(root, 'fresh.sqlite');
  await writeBundle(bundle, inputDir);
  vi.stubGlobal('fetch', () => { throw new Error('Import must never request network'); });
});
afterEach(() => { closeDb(); vi.unstubAllGlobals(); if (savedPath === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = savedPath; fs.rmSync(root, { recursive: true, force: true }); });
async function run(options: Record<string, unknown> = {}) {
  expect(importer?.importSyntheticTranscripts, 'offline importer exists').toBeTypeOf('function');
  return importer!.importSyntheticTranscripts({ inputDir, databasePath, ...options });
}
describe('isolated offline transcript import', () => {
  it('dry run reads no truth, writes nothing and does not change DATABASE_PATH', async () => {
    fs.rmSync(path.join(inputDir, 'ground-truth'), { recursive: true });
    fs.symlinkSync(path.join(root, 'absent'), path.join(inputDir, 'ground-truth'));
    const before = fs.readdirSync(root), previous = process.env.DATABASE_PATH;
    expect(await run()).toMatchObject({ isSimulated: true, dryRun: true, elderId: bundle.profile.elderId, callCount: 12, markerCount: 96, baselineCount: 7 });
    expect(fs.readdirSync(root)).toEqual(before); expect(process.env.DATABASE_PATH).toBe(previous);
  });
  it('imports exact calls, real helper markers/baselines/z and an existing family timeline', async () => {
    expect(await run({ apply: true })).toMatchObject({ dryRun: false, callCount: 12, markerCount: 96, baselineCount: 7 });
    expect(fs.statSync(databasePath).mode & 0o777).toBe(0o600);
    const db = new Database(databasePath, { readonly: true });
    try {
      expect(db.prepare('SELECT * FROM elders').get()).toMatchObject({ id: bundle.profile.elderId, display_name: bundle.profile.name, preferred_name: 'Hal', primary_contact_name: 'Linda', is_simulated: 1, about: `${helper!.SYNTHETIC_TRANSCRIPT_NOTICE}\n\n${bundle.profile.biography}` });
      expect(db.prepare('SELECT name,relation FROM family_members ORDER BY rowid').all()).toEqual(bundle.profile.family.map(f => ({ name: f.name, relation: f.relationship })));
      expect(db.prepare('SELECT * FROM consents').get()).toMatchObject({ fam_summaries: 1, fam_speech_trends: 1, fam_fun_facts: 0, fam_mood: 0, elder_summaries: 1, elder_speech_trends: 1, elder_fun_facts: 0, elder_mood: 0, elder_confirmed_call_id: null });
      for (const call of bundle.calls) {
        const stored = db.prepare('SELECT * FROM calls WHERE id=?').get(call.callId) as Record<string, unknown>;
        expect(stored).toMatchObject({ elder_id: call.elderId, started_at: call.startedAt, ended_at: call.endedAt, language: call.language, duration_s: Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000), audio_path: null, is_simulated: 1, status: 'done', mood_label: null });
        expect(JSON.parse(stored.utterances_json as string)).toEqual(call.utterances);
        const first = call.utterances.find(u => u.speaker === 'caller')!.text, chars = Array.from(first);
        expect(stored.summary).toBe(`Transcript excerpt: “${chars.slice(0, 220).join('')}${chars.length > 220 ? '…' : ''}”`);
        const markers = db.prepare('SELECT marker,value,unit,confidence FROM call_markers WHERE call_id=? AND marker != ? ORDER BY marker').all(call.callId, 'repeat_stories');
        expect(markers).toEqual(computeMarkers(call.utterances as Utterance[], call.language as Lang).sort((a,b) => a.marker.localeCompare(b.marker)));
        expect(db.prepare('SELECT value,z,confidence FROM call_markers WHERE call_id=? AND marker=?').get(call.callId, 'repeat_stories')).toEqual({ value: null, z: null, confidence: 'na' });
      }
      for (const marker of MARKER_KEYS.filter(k => k !== 'repeat_stories')) {
        const selected = bundle.calls.map(c => ({ call: c, result: computeMarkers(c.utterances as Utterance[], c.language as Lang).find(m => m.marker === marker)! })).filter(r => r.result.confidence === 'high' && r.result.value !== null).slice(0, BASELINE_N);
        const expected = buildBaseline(selected.map(r => r.result.value!));
        const stored = db.prepare('SELECT * FROM baselines WHERE marker=?').get(marker) as Record<string, unknown>;
        expect(stored).toMatchObject(expected); expect(JSON.parse(stored.call_ids_json as string)).toEqual(selected.map(r => r.call.callId));
        for (const call of bundle.calls) {
          const row = db.prepare('SELECT value,z FROM call_markers WHERE call_id=? AND marker=?').get(call.callId, marker) as { value: number; z: number };
          expect(row.z).toBeCloseTo(signedZ(row.value, expected, markerMeta(marker).concern, ABS_SPREAD_FLOOR[marker] ?? MIN_SCALE), 12);
        }
      }
      for (const table of ['topics','nudges','fun_facts','call_events','photos','family_questions','safety_events']) expect(db.prepare(`SELECT count(*) n FROM ${table}`).get()).toEqual({ n: 0 });
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally { db.close(); }
    process.env.DATABASE_PATH = databasePath;
    const timeline = buildTimeline(bundle.profile.elderId)!;
    expect(timeline.calls).toHaveLength(12); expect(timeline.calls.every(c => c.isSimulated && c.summary?.startsWith('Transcript excerpt:'))).toBe(true);
    expect(timeline.markers.find(m => m.key === 'mean_pause_ms')!.points.map(p => p.value)).toEqual(bundle.calls.map(c => computeMarkers(c.utterances as Utterance[], 'en').find(m => m.marker === 'mean_pause_ms')!.value));
    expect(JSON.stringify(timeline)).not.toContain('utterances'); expect(timeline.repeats).toEqual([]); expect(timeline.nudges).toEqual([]);
  });
  it('refuses existing databases and sidecar collisions while preserving sentinel bytes', async () => {
    const existing = new Database(databasePath); existing.exec("CREATE TABLE sentinel (text); INSERT INTO sentinel VALUES ('keep');"); existing.close();
    const snapshot = fs.readFileSync(databasePath);
    await expect(run({ apply: true })).rejects.toThrow(); expect(fs.readFileSync(databasePath)).toEqual(snapshot);
    for (const suffix of ['-wal','-shm','-journal']) {
      const fresh = path.join(root, `collision${suffix}.sqlite`); fs.writeFileSync(`${fresh}${suffix}`, 'keep');
      await expect(run({ apply: true, databasePath: fresh })).rejects.toThrow(); expect(fs.existsSync(fresh)).toBe(false); expect(fs.readFileSync(`${fresh}${suffix}`, 'utf8')).toBe('keep');
    }
  });
  it('rejects missing/unsafe paths, symlinks, source destinations, and changed sources before reserving', async () => {
    const alias = path.join(root, 'alias'); fs.symlinkSync(root, alias);
    const link = path.join(root, 'dangling.sqlite'); fs.symlinkSync(path.join(root, 'absent'), link);
    for (const dest of [undefined, '', ':memory:', link, path.join(alias, 'new.sqlite'), path.join(root, 'missing', 'new.sqlite'), path.join(inputDir, 'new.sqlite'), `${root}/./new.sqlite`, `${root}/x/../new.sqlite`, `${root}/bad\\name.sqlite`]) await expect(run({ apply: true, databasePath: dest })).rejects.toThrow();
    await expect(run({ apply: 'yes' })).rejects.toThrow();
    fs.appendFileSync(path.join(inputDir, 'profile.json'), ' ');
    await expect(run({ apply: true })).rejects.toThrow(); expect(fs.existsSync(databasePath)).toBe(false);
  });
  it('labels only the exact transcript notice and nonempty simulated calls', () => {
    expect(helper?.isSyntheticTranscriptDemo, 'shared provenance helper exists').toBeTypeOf('function');
    const profile = { about: `${helper!.SYNTHETIC_TRANSCRIPT_NOTICE}\n\nBio` };
    expect(helper!.isSyntheticTranscriptDemo(profile, [{ isSimulated: true }])).toBe(true);
    expect(helper!.isSyntheticTranscriptDemo(profile, [])).toBe(false);
    expect(helper!.isSyntheticTranscriptDemo(profile, [{ isSimulated: false }])).toBe(false);
    expect(helper!.isSyntheticTranscriptDemo({ about: 'Other demo' }, [{ isSimulated: true }])).toBe(false);
  });
});

describe('offline importer CLI', () => {
  it('supports help/dry-run/apply and rejects ambiguous options without credentials or overwritten output', () => {
    const cli = path.resolve('scripts/import-synthetic.ts'), tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
    const invoke = (args: string[]) => spawnSync(process.execPath, [tsx, cli, ...args], {
      encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'test' },
    });
    const help = invoke(['--help']);
    expect(help.status).toBe(0); expect(help.stdout).toContain('--apply');
    const dry = invoke(['--input', inputDir]);
    expect(dry.status).toBe(0); expect(JSON.parse(dry.stdout)).toMatchObject({ dryRun: true, callCount: 12, markerCount: 96, baselineCount: 7 });
    for (const args of [[], ['--input'], ['--help','--apply'], ['--unknown'], ['--input',inputDir,'--input',inputDir], ['--input',inputDir,'--apply'], ['--input',inputDir,'--apply','--apply']]) {
      const result = invoke(args); expect(result.status).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr).toMatch(/^SYNTHETIC_IMPORT_[A-Z_]+\n$/);
    }
    expect(fs.readdirSync(root)).toEqual(['source']);
    const apply = invoke(['--input', inputDir, '--database', databasePath, '--apply']);
    expect(apply.status).toBe(0); expect(JSON.parse(apply.stdout)).toMatchObject({ dryRun: false, databasePath, callCount: 12 });
    const snapshot = fs.readFileSync(databasePath);
    const retry = invoke(['--input', inputDir, '--database', databasePath, '--apply']);
    expect(retry.status).toBe(1); expect(fs.readFileSync(databasePath)).toEqual(snapshot);
  });
});
