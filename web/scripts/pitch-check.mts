// Live check for the voice markers (markers.md §4b). Two modes:
//   npx tsx scripts/pitch-check.mts                 → OpenAI TTS reads the same text twice, once
//                                                     flat and once expressive; the expressive clip
//                                                     should score higher on both markers.
//   npx tsx scripts/pitch-check.mts --file my.wav   → analyse any WAV (e.g. a Mac voice memo
//                                                     exported as WAV), no API call.
// Needs OPENAI_API_KEY in web/.env.local for the TTS mode (never printed).
import fs from 'node:fs';
import { loadLocalEnv } from '../lib/server/env';
import { pitchMarkers, trackPitch } from '../lib/markers/pitch';
import { parseWav } from '../lib/markers/wav';

loadLocalEnv();

function analyse(label: string, bytes: Uint8Array): { pitch_var: number | null; pitch_range: number | null } {
  const { sampleRate, samples } = parseWav(bytes);
  const t0 = performance.now();
  const voiced = trackPitch(samples, sampleRate).f0.filter((v): v is number => v !== null);
  const m = Object.fromEntries(pitchMarkers(samples, sampleRate, undefined, true).map((r) => [r.marker, r]));
  const ms = Math.round(performance.now() - t0);
  const med = voiced.length ? [...voiced].sort((a, b) => a - b)[Math.floor(voiced.length / 2)] : NaN;
  const fmt = (v: number | null) => (v === null ? 'n/a' : v.toFixed(2));
  console.log(
    `${label.padEnd(12)} ${(samples.length / sampleRate).toFixed(1)} s audio, ${voiced.length} voiced frames, median F0 ${med.toFixed(0)} Hz | ` +
      `pitch_var ${fmt(m.pitch_var.value)} st (${m.pitch_var.confidence}), pitch_range ${fmt(m.pitch_range.value)} st | ${ms} ms`,
  );
  return { pitch_var: m.pitch_var.value, pitch_range: m.pitch_range.value };
}

const fileIdx = process.argv.indexOf('--file');
if (fileIdx > -1) {
  const file = process.argv[fileIdx + 1];
  if (!file) throw new Error('usage: --file path/to/audio.wav');
  analyse('file', new Uint8Array(fs.readFileSync(file)));
} else {
  const { getOpenAI } = await import('../lib/analysis/llm');
  const text =
    'Well, I worked at the railroad shops for thirty-eight years. Every morning I walked down the hill ' +
    'with my lunch pail, and the whistle blew at seven sharp. We fixed the big engines, and I mean the ' +
    'really big ones. Oh, and the winter of seventy-seven, the snow came right through the roundhouse roof. ' +
    'We slept there two nights to keep the engines warm. My wife thought I had lost my mind!';
  const clips: [string, string][] = [
    ['monotone', 'Speak in a completely flat, monotone voice with no rise and fall, like reading a list.'],
    ['expressive', 'Speak warmly and very expressively, like a grandfather telling a favourite story, with lots of rise and fall.'],
  ];
  const out: Record<string, { pitch_var: number | null; pitch_range: number | null }> = {};
  for (const [label, instructions] of clips) {
    const res = await getOpenAI().audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: 'ash',
      input: text,
      instructions,
      response_format: 'wav',
    });
    out[label] = analyse(label, new Uint8Array(await res.arrayBuffer()));
  }
  const ok =
    (out.expressive.pitch_var ?? 0) > (out.monotone.pitch_var ?? 0) &&
    (out.expressive.pitch_range ?? 0) > (out.monotone.pitch_range ?? 0);
  console.log(ok ? 'PASS: expressive > monotone on both markers' : 'CHECK: expressive did not score higher on both markers');
  process.exitCode = ok ? 0 : 1;
}
