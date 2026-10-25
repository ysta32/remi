// Standalone measurement of existing fictional WAVs. Never calls processCall or opens a DB.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCanonicalCallSource } from '../../../synthetic/src/read.mjs';
import { parseWav } from '../markers/wav';
import { pitchMarkersAsync } from '../markers/pitch';
import { computeMarkers } from '../markers';
import { attachWords } from './pipeline';
import { transcribeWords, DEFAULT_STT_MODEL } from './stt';
import { PITCH_MAX_SECONDS } from './config';
import type { Lang, Utterance, Word } from '../types';
const fail = (code: string) => new Error(`SYNTHETIC_AUDIO_${code}`);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function safeAbsolute(value: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\\\0]/.test(value) || value.split('/').some(p => p === '.' || p === '..')) throw fail('PATH_UNSAFE');
  return path.resolve(value);
}
function noSymlinks(filename: string): void {
  for (let p = filename;; p = path.dirname(p)) {
    if (fs.lstatSync(p).isSymbolicLink()) throw fail('PATH_UNSAFE');
    if (p === path.dirname(p)) break;
  }
}
export function validateMeasuredWords(value: unknown, durationMs: number): Word[] {
  if (!Array.isArray(value) || !value.length) throw fail('STT_WORDS_MISSING');
  let previous = -1;
  for (const word of value) {
    if (!word || typeof word.w !== 'string' || !word.w.trim() || !Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.startMs < previous || word.startMs < 0 || word.endMs < word.startMs || word.endMs > durationMs) throw fail('STT_TIMING_INVALID');
    previous = word.startMs;
  }
  return value as Word[];
}
interface AudioTiming {
  sampleRate: number; totalSamples: number;
  utterances: Utterance[];
  segments: { index: number; turnIndex: number; startSample: number; endSample: number }[];
}
/** Require sample boundaries and canonical turn identity, never authored word times. */
export function validateAudioTiming(timing: AudioTiming, canonical: Utterance[], sampleRate: number, totalSamples: number): void {
  if (timing.sampleRate !== sampleRate || timing.totalSamples !== totalSamples || !Array.isArray(timing.utterances) || timing.utterances.length !== canonical.length || !Array.isArray(timing.segments) || !timing.segments.length) throw fail('TIMING_INVALID');
  let previousEnd = 0, previousTurn = 0;
  for (const [index, segment] of timing.segments.entries()) {
    if (segment.index !== index || !Number.isInteger(segment.turnIndex) || segment.turnIndex < previousTurn || segment.turnIndex >= canonical.length || !Number.isInteger(segment.startSample) || !Number.isInteger(segment.endSample) || segment.startSample < previousEnd || segment.endSample <= segment.startSample || segment.endSample > totalSamples) throw fail('TIMING_INVALID');
    previousEnd = segment.endSample; previousTurn = segment.turnIndex;
  }
  for (const [index, turn] of timing.utterances.entries()) {
    const segments = timing.segments.filter(segment => segment.turnIndex === index);
    if (!segments.length || turn.speaker !== canonical[index].speaker || turn.text !== canonical[index].text || turn.startMs < 0 || turn.startMs !== segments[0].startSample / (sampleRate / 1000) || turn.endMs !== segments[segments.length-1].endSample / (sampleRate / 1000)) throw fail('TIMING_INVALID');
  }
}
function readSafe(filename: string): Buffer {
  noSymlinks(filename);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try { if (!fs.fstatSync(fd).isFile()) throw fail('PATH_UNSAFE'); return fs.readFileSync(fd); } finally { fs.closeSync(fd); }
}
export interface SyntheticAudioInput { inputDir: string; audioDir: string; outputDir: string; apply?: boolean }
export interface SyntheticAudioDependencies {
  stt?: (filename: string, lang: Lang) => Promise<Word[] | null>;
  pitch?: typeof pitchMarkersAsync;
  provider?: string;
  model?: string;
  pitchProvider?: string;
  onProgress?: (event: { callId: string; status: string }) => void;
}
export async function analyzeSyntheticAudio(input: SyntheticAudioInput, dependencies: SyntheticAudioDependencies = {}) {
  const { apply = false } = input;
  if (typeof apply !== 'boolean') throw fail('OPTIONS_INVALID');
  const sourceDir = safeAbsolute(input.inputDir), audioDir = safeAbsolute(input.audioDir), outputDir = safeAbsolute(input.outputDir);
  noSymlinks(sourceDir); noSymlinks(audioDir); noSymlinks(path.dirname(outputDir));
  for (const source of [sourceDir,audioDir]) if (outputDir === source || outputDir.startsWith(source + path.sep) || source.startsWith(outputDir + path.sep)) throw fail('PATH_UNSAFE');
  if (fs.existsSync(outputDir)) throw fail('DESTINATION_EXISTS');
  const source = await loadCanonicalCallSource(sourceDir);
  const manifestBytes = readSafe(path.join(audioDir,'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString());
  const sourceHash = hash(fs.readFileSync(path.join(sourceDir,'manifest.json')));
  if (manifest.schemaVersion !== 1 || manifest.isSimulated !== true || manifest.timingSource !== 'synthetic_audio_samples' || manifest.sourceManifestSha256 !== sourceHash || !Array.isArray(manifest.calls) || manifest.calls.length !== source.calls.length) throw fail('SOURCE_INVALID');
  const checked = new Map<string,string>();
  const readArtifact = (relative: string): Buffer => {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '..' || p === '.') || /[\\\0]/.test(relative)) throw fail('PATH_UNSAFE');
    const filename = path.join(audioDir,relative); noSymlinks(filename);
    const bytes = readSafe(filename), digest = hash(bytes);
    if (manifest.files?.[relative] !== digest) throw fail('HASH_MISMATCH');
    checked.set(filename,digest); return bytes;
  };
  // Validate every declared artifact before any network or output reservation.
  for (const name of Object.keys(manifest.files ?? {})) readArtifact(name);
  const seen = new Set<string>();
  const calls = manifest.calls.map((entry: {callId:string; callerPath:string; timingPath:string}) => {
    const call = source.calls.find((c: {callId:string}) => c.callId === entry.callId);
    if (!call || seen.has(entry.callId) || !/^call_[a-zA-Z0-9_-]+$/.test(entry.callId)) throw fail('SOURCE_INVALID');
    seen.add(entry.callId);
    const timing = JSON.parse(readArtifact(entry.timingPath).toString());
    const parsed = parseWav(readArtifact(entry.callerPath));
    const durationMs = parsed.samples.length / parsed.sampleRate * 1000;
    if (timing.callId !== entry.callId || timing.isSimulated !== true || timing.timingSource !== 'synthetic_audio_samples' || timing.sampleRate !== parsed.sampleRate || timing.totalSamples !== parsed.samples.length || !Array.isArray(timing.utterances)) throw fail('TIMING_INVALID');
    validateAudioTiming(timing,call.utterances,parsed.sampleRate,parsed.samples.length);
    let previous = -1;
    const utterances: Utterance[] = timing.utterances.map((u: Utterance) => {
      if (!['caller','agent'].includes(u.speaker) || !Number.isFinite(u.startMs) || !Number.isFinite(u.endMs) || u.startMs < previous || u.endMs <= u.startMs || u.endMs > Math.ceil(durationMs)) throw fail('TIMING_INVALID');
      previous = u.endMs;
      // Explicitly discard authored lexical content and any authored word timings.
      return {speaker:u.speaker, text:'', startMs:u.startMs,endMs:u.endMs};
    });
    if (!utterances.some((u: Utterance) => u.speaker === 'caller')) throw fail('TIMING_INVALID');
    return {entry, call, utterances, durationMs};
  });
  const summary = { dryRun: !apply, isSimulated:true, callCount:calls.length, sourceManifestSha256:sourceHash, audioManifestSha256:hash(manifestBytes) };
  if (!apply) return summary;
  const outputState: { identity?: fs.Stats } = {};
  const checkCurrent = async () => {
    if (outputState.identity) { noSymlinks(outputDir); const now = fs.lstatSync(outputDir); if (now.ino !== outputState.identity.ino || now.dev !== outputState.identity.dev) throw fail('PATH_UNSAFE'); }
    noSymlinks(sourceDir); noSymlinks(audioDir); noSymlinks(path.dirname(outputDir));
    await loadCanonicalCallSource(sourceDir);
    if (hash(fs.readFileSync(path.join(sourceDir,'manifest.json'))) !== sourceHash || hash(readSafe(path.join(audioDir,'manifest.json'))) !== summary.audioManifestSha256) throw fail('SOURCE_CHANGED');
    for (const [filename,digest] of checked) { noSymlinks(filename); if (hash(fs.readFileSync(filename)) !== digest) throw fail('SOURCE_CHANGED'); }
  };
  await checkCurrent(); fs.mkdirSync(outputDir); outputState.identity = fs.lstatSync(outputDir);
  const results = [];
  for (const {entry,call,utterances,durationMs} of calls) {
    await checkCurrent();
    const words = validateMeasuredWords(await (dependencies.stt ?? transcribeWords)(path.join(audioDir,entry.callerPath),call.language as Lang),durationMs);
    // Reject STT hallucinations in agent/silence spans, rather than moving them into caller turns.
    const callerWords = words.filter(w => utterances.some((u: Utterance) => u.speaker === 'caller' && w.startMs >= u.startMs && w.endMs <= u.endMs));
    if (!callerWords.length) throw fail('CALLER_WORDS_MISSING');
    const attached = attachWords(utterances,callerWords).map(u => ({...u,text:(u.words ?? []).map(w => w.w).join(' ')}));
    const missingCallerTurns = attached.filter((u: Utterance) => u.speaker === 'caller' && !u.words?.length).length;
    const measured = attached.filter(u => u.speaker === 'agent' || u.words?.length);
    const textMarkers = computeMarkers(measured,call.language as Lang);
    const adequate = textMarkers.some(m => m.confidence === 'high');
    const parsed = parseWav(readArtifact(entry.callerPath));
    const spans = callerWords.map(w => ({startMs:w.startMs,endMs:w.endMs}));
    const pitchMarkers = await (dependencies.pitch ?? pitchMarkersAsync)(parsed.samples.subarray(0,Math.floor(PITCH_MAX_SECONDS * parsed.sampleRate)),parsed.sampleRate,spans,adequate);
    const result = {callId:entry.callId,isSimulated:true,status:missingCallerTurns ? 'incomplete_coverage' : 'measured',timingSource:'synthetic_audio_samples_and_stt',lexicalSource:'stt_only',missingCallerTurns,discardedOutsideCallerWords:words.length-callerWords.length,durationMs,words:callerWords,utterances:attached,textMarkers,pitchMarkers};
    await checkCurrent(); fs.writeFileSync(path.join(outputDir,entry.callId+'.json'),JSON.stringify(result,null,2),{flag:'wx'});
    results.push({callId:entry.callId,status:result.status}); dependencies.onProgress?.({callId:entry.callId,status:result.status});
  }
  await checkCurrent();
  fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify({...summary,dryRun:false,notice:'SIMULATED synthesized fiction. Speech measurements are not clinical evidence or accuracy results.',provider:dependencies.provider ?? (dependencies.stt ? 'injected' : 'openai'),model:dependencies.model ?? (dependencies.stt ? 'unknown' : process.env.OPENAI_STT_MODEL ?? DEFAULT_STT_MODEL),pitchProvider:dependencies.pitchProvider ?? (dependencies.pitch ? 'injected' : 'local_pitchMarkersAsync'),sourceArtifactSha256:manifest.files,results},null,2),{flag:'wx'});
  fs.writeFileSync(path.join(outputDir,'README.md'),'Synthetic caller audio measurements only. Text uses STT words exclusively; uncovered caller turns are explicit, never filled with authored text. Pitch confidence is independent of text confidence. No database writes. A missing manifest means the run failed or is incomplete.\n',{flag:'wx'});
  return {...summary,dryRun:false,results};
}
