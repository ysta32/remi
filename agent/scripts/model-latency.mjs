// Times the model alone, no FaceTime: streams spoken clips into the realtime API in real
// time with the agent's settings and prompt, and reports per clip
//   endpoint  clip end → speech_stopped arrives (silence wait + network)
//   respond   speech_stopped → response.created
//   model     response.created → first audio delta
// usage: npm run latency:model -- clip1.wav [clip2.wav ...]   (16-bit mono PCM WAV at 24 kHz)
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { readConfig } from '../lib/config.mjs';
import { buildInstructions } from '../brain/index.mjs';

const config = readConfig();
const ctx = JSON.parse(readFileSync(new URL('../fixtures/context.v2.json', import.meta.url), 'utf8'));
const instructions = process.env.SHORT_PROMPT ? 'You are Remi, a warm, funny companion on a call with Hal. Reply in two to four sentences.' : buildInstructions(ctx, { contractV2: config.contractV2 });
const RATE = 24000;
const CHUNK = RATE * 2 * 0.02; // 20 ms of 16-bit mono

function pcmOf(path) {
  const buf = readFileSync(path);
  const at = buf.indexOf('data');
  if (at < 0) throw new Error(`${path}: no WAV data chunk`);
  return buf.subarray(at + 8);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runClip(path) {
  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.realtimeModel)}`, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  const t = {};
  let timer;
  const done = new Promise((resolve, reject) => {
    ws.on('message', (raw) => {
      const ev = JSON.parse(raw);
      const now = performance.now();
      if (ev.type === 'input_audio_buffer.speech_stopped' && !t.stopped) t.stopped = now;
      else if (ev.type === 'response.created') { t.responses = (t.responses ?? 0) + 1; if (!t.created) t.created = now; }
      else if ((ev.type === 'response.output_audio.delta' || ev.type === 'response.audio.delta') && !t.audio) { t.audio = now; resolve(); }
      else if (ev.type === 'error') reject(new Error(ev.error?.message ?? 'realtime error'));
    });
    ws.on('error', reject);
    timer = setTimeout(() => reject(new Error('timed out')), 20000);
  });
  done.catch(() => {}).finally(() => clearTimeout(timer));
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions,
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: RATE },
          noise_reduction: { type: config.noiseReduction },
          turn_detection: config.turnDetection === 'semantic' ? { type: 'semantic_vad', eagerness: process.env.EAGERNESS || 'high', create_response: true, interrupt_response: true } : { type: 'server_vad', threshold: config.vadThreshold, prefix_padding_ms: 300, silence_duration_ms: config.turnSilenceMs, create_response: true, interrupt_response: true },
        },
        output: { voice: config.voice },
      },
      ...(process.env.REASONING ? { reasoning: { effort: process.env.REASONING } } : {}),
    },
  }));
  await sleep(500);
  let pcm;
  try { pcm = pcmOf(path); } catch (err) { ws.close(); throw err; }
  const t0 = performance.now();
  for (let off = 0, i = 0; off < pcm.length; off += CHUNK, i++) {
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.subarray(off, off + CHUNK).toString('base64') }));
    const wait = t0 + (i + 1) * 20 - performance.now();
    if (wait > 0) await sleep(wait);
  }
  t.clipEnd = performance.now();
  const silence = Buffer.alloc(CHUNK).toString('base64');
  const feeding = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: silence })), 20);
  // EARLY_COMMIT_MS: end the turn ourselves after this much silence (what a local endpointer would do).
  const early = Number(process.env.EARLY_COMMIT_MS);
  if (early > 0) setTimeout(() => {
    if (t.stopped || ws.readyState !== 1) return;
    t.stopped = performance.now(); t.early = true;
    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    ws.send(JSON.stringify({ type: 'response.create' }));
  }, early);
  try { await done; await sleep(2500); } finally { clearInterval(feeding); ws.close(); }
  const r = (a, b) => Math.round(t[b] - t[a]);
  return { endpoint: r('clipEnd', 'stopped'), respond: r('stopped', 'created'), model: r('created', 'audio'), total: r('clipEnd', 'audio'), responses: t.responses, early: !!t.early };
}

const clips = process.argv.slice(2);
if (!clips.length) { console.error('usage: npm run latency:model -- clip.wav [...]'); process.exit(2); }
if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY is not set'); process.exit(3); }
console.log(`model ${config.realtimeModel}${process.env.REASONING ? ` (reasoning ${process.env.REASONING})` : ''}, ${config.turnDetection === 'semantic' ? `semantic VAD (${process.env.EAGERNESS || 'high'})` : `silence ${config.turnSilenceMs} ms`}, prompt ${instructions.split(/\s+/).length} words`);
const rows = [];
for (const clip of clips) {
  try { const r = await runClip(clip); rows.push(r); console.log(`${clip.split('/').pop()}: endpoint ${r.endpoint} + respond ${r.respond} + model ${r.model} = ${r.total} ms${r.early ? ' (early commit)' : ''}${r.responses > 1 ? ` [${r.responses} responses!]` : ''}`); }
  catch (err) { console.log(`${clip}: ${err.message}`); }
}
const med = (k) => [...rows.map((r) => r[k])].sort((a, b) => a - b)[Math.floor(rows.length / 2)];
if (rows.length) console.log(`median: endpoint ${med('endpoint')} + respond ${med('respond')} + model ${med('model')} = ${med('total')} ms`);
