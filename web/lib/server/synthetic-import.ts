// Offline-only importer: no global DB client, credentials, providers or pipeline imports.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from '../../db/migrate';
import { loadTranscriptSource } from '../../../synthetic/src/read.mjs';
import { computeMarkers } from '../markers';
import { markerMeta, TEXT_MARKER_KEYS } from '../markers/meta';
import { ABS_SPREAD_FLOOR, BASELINE_N, MIN_SCALE } from '../analysis/config';
import { buildBaseline, signedZ, type Baseline } from '../analysis/stats';
import { SYNTHETIC_TRANSCRIPT_NOTICE } from '../synthetic-demo';
import type { Lang, MarkerKey, Utterance } from '../types';

type Source = {
  profile: { elderId: string; name: string; biography: string; language: Lang; timezone: string; family: { name: string; relationship: string }[] };
  calls: { callId: string; elderId: string; startedAt: string; endedAt: string; language: Lang; utterances: Utterance[] }[];
};
export interface SyntheticImportOptions { inputDir: string; databasePath?: string; apply?: boolean }
const fail = (code: string) => new Error(`SYNTHETIC_IMPORT_${code}`);

function safePath(value: string | undefined): string {
  if (typeof value !== 'string' || !value || value === ':memory:' || /[\0\\]/.test(value)) throw fail('PATH_UNSAFE');
  const parts = (path.isAbsolute(value) ? value.slice(path.parse(value).root.length) : value).split(path.sep);
  if (parts.some(part => !part || part === '.' || part === '..')) throw fail('PATH_UNSAFE');
  return path.resolve(value);
}
function absent(filename: string): void {
  try { fs.lstatSync(filename); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw fail('PATH_UNSAFE');
  }
  throw fail('DESTINATION_EXISTS');
}
function destinationChecks(destination: string, source: string): () => void {
  if (destination === source || destination.startsWith(`${source}${path.sep}`)) throw fail('PATH_UNSAFE');
  const identities: { directory: string; dev: number; ino: number }[] = [];
  for (let directory = path.dirname(destination); ; directory = path.dirname(directory)) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('PATH_UNSAFE');
    identities.push({ directory, dev: stat.dev, ino: stat.ino });
    if (directory === path.dirname(directory)) break;
  }
  const check = () => {
    for (const expected of identities) {
      const stat = fs.lstatSync(expected.directory);
      if (stat.isSymbolicLink() || !stat.isDirectory() || stat.dev !== expected.dev || stat.ino !== expected.ino) throw fail('PATH_UNSAFE');
    }
    for (const suffix of ['-wal', '-shm', '-journal']) absent(`${destination}${suffix}`);
  };
  check(); absent(destination);
  return check;
}

/** Only apply=true reserves a fresh DB. A failed apply leaves its new file for inspection. */
export async function importSyntheticTranscripts({ inputDir, databasePath, apply = false }: SyntheticImportOptions) {
  if (typeof apply !== 'boolean') throw fail('OPTIONS_INVALID');
  // Source validation and all pure calculations precede any destination writes.
  const source = await loadTranscriptSource(inputDir) as Source;
  const calls = [...source.calls].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.callId.localeCompare(b.callId));
  const computed = new Map(calls.map(call => [call.callId, computeMarkers(call.utterances, call.language)]));
  const baselines = new Map<string, Baseline & { callIds: string[]; marker: MarkerKey; language: Lang }>();
  for (const language of ['en', 'zh'] as const) {
    for (const marker of TEXT_MARKER_KEYS) {
      const selected = calls.filter(call => {
        const result = computed.get(call.callId)!.find(row => row.marker === marker)!;
        return call.language === language && result.confidence === 'high' && result.value !== null;
      }).slice(0, BASELINE_N);
      if (selected.length < BASELINE_N) continue;
      const baseline = buildBaseline(selected.map(call => computed.get(call.callId)!.find(row => row.marker === marker)!.value!));
      baselines.set(`${marker}|${language}`, { ...baseline, marker, language, callIds: selected.map(call => call.callId) });
    }
  }
  const summary = { isSimulated: true, dryRun: !apply, elderId: source.profile.elderId, callCount: calls.length,
    markerCount: [...computed.values()].reduce((n, rows) => n + rows.length + 1, 0), baselineCount: baselines.size };
  const destination = databasePath === undefined && !apply ? undefined : safePath(databasePath);
  const check = destination ? destinationChecks(destination, safePath(inputDir)) : undefined;
  if (!apply) return summary;
  // migrate() intentionally resolves existing migration files from web/.
  if (!fs.existsSync(path.join(process.cwd(), 'db', 'migrations', '0001_init.sql'))) throw fail('RUN_FROM_WEB');
  check!();
  const fd = fs.openSync(destination!, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  let sqlite: Database.Database | undefined;
  try {
    check!();
    const reserved = fs.fstatSync(fd), actual = fs.lstatSync(destination!);
    if (!actual.isFile() || actual.isSymbolicLink() || actual.dev !== reserved.dev || actual.ino !== reserved.ino) throw fail('PATH_UNSAFE');
    sqlite = new Database(destination!, { fileMustExist: true });
    sqlite.pragma('foreign_keys = ON');
    migrate(sqlite);
    const db = sqlite, profile = source.profile, createdAt = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`INSERT INTO elders (id,display_name,preferred_name,language,timezone,about,primary_contact_name,is_simulated,created_at)
        VALUES (?,?, 'Hal',?,?,?, 'Linda',1,?)`).run(profile.elderId, profile.name, profile.language, profile.timezone, `${SYNTHETIC_TRANSCRIPT_NOTICE}\n\n${profile.biography}`, createdAt);
      const member = db.prepare('INSERT INTO family_members (id,elder_id,name,relation) VALUES (?,?,?,?)');
      profile.family.forEach((row, i) => member.run(`${profile.elderId}-family-${i + 1}`, profile.elderId, row.name, row.relationship));
      // Fictional sharing choices; no event falsely claims a spoken confirmation.
      db.prepare(`INSERT INTO consents (elder_id,fam_summaries,fam_fun_facts,fam_speech_trends,fam_mood,
        elder_summaries,elder_fun_facts,elder_speech_trends,elder_mood,updated_at) VALUES (?,1,0,1,0,1,0,1,0,?)`).run(profile.elderId, createdAt);
      const insertCall = db.prepare(`INSERT INTO calls (id,elder_id,started_at,ended_at,duration_s,language,status,utterances_json,summary,audio_path,is_simulated,created_at)
        VALUES (?,?,?,?,?,?,'done',?,?,NULL,1,?)`);
      const insertMarker = db.prepare('INSERT INTO call_markers (call_id,marker,value,unit,z,confidence) VALUES (?,?,?,?,?,?)');
      for (const call of calls) {
        const text = call.utterances.find(turn => turn.speaker === 'caller')?.text ?? '', chars = Array.from(text);
        const excerpt = `Transcript excerpt: “${chars.slice(0, 220).join('')}${chars.length > 220 ? '…' : ''}”`;
        insertCall.run(call.callId, call.elderId, call.startedAt, call.endedAt, Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000), call.language, JSON.stringify(call.utterances), excerpt, createdAt);
        for (const row of computed.get(call.callId)!) {
          const baseline = baselines.get(`${row.marker}|${call.language}`);
          const z = baseline && row.confidence === 'high' && row.value !== null ? signedZ(row.value, baseline, markerMeta(row.marker).concern, ABS_SPREAD_FLOOR[row.marker] ?? MIN_SCALE) : null;
          insertMarker.run(call.callId, row.marker, row.value, row.unit, z, row.confidence);
        }
        insertMarker.run(call.callId, 'repeat_stories', null, markerMeta('repeat_stories', call.language).unit, null, 'na');
      }
      const insertBaseline = db.prepare('INSERT INTO baselines (elder_id,marker,language,median,mad,n,call_ids_json,computed_at) VALUES (?,?,?,?,?,?,?,?)');
      for (const baseline of baselines.values()) insertBaseline.run(profile.elderId, baseline.marker, baseline.language, baseline.median, baseline.mad, baseline.n, JSON.stringify(baseline.callIds), createdAt);
    })();
    return { ...summary, databasePath: destination };
  } finally { try { sqlite?.close(); } finally { fs.closeSync(fd); } }
}
