import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLatencyProbe, formatLatency } from '../lib/latency-probe.mjs';

test('splits a turn into endpoint, respond, model, playout and times the bridge echo', () => {
  let t = 0;
  const probe = createLatencyProbe({ now: () => t });
  for (; t < 1000; t += 20) probe.onCallerFrame({ rms: 0.002, at: t });   // quiet line
  for (; t < 2000; t += 20) probe.onCallerFrame({ rms: 0.1, at: t });     // caller talks, last loud frame at 1980
  for (; t < 2500; t += 20) probe.onCallerFrame({ rms: 0.002, at: t });
  t = 2480; probe.onServerEvent({ type: 'input_audio_buffer.speech_stopped' });
  t = 2530; probe.onServerEvent({ type: 'response.created' });
  t = 2900; probe.onServerEvent({ type: 'response.output_audio.delta' });
  t = 2950; probe.onAgentState('speaking');
  probe.onCallerFrame({ rms: 0.002, at: 3100 });
  probe.onCallerFrame({ rms: 0.2, at: 3350 });                            // echo returns 400 ms later
  const s = probe.summary();
  assert.deepEqual(
    { endpoint: s.endpoint, respond: s.respond, model: s.model, playout: s.playout, total: s.total, rtt: s.bridgeRtt },
    { endpoint: 500, respond: 50, model: 370, playout: 50, total: 970, rtt: 400 },
  );
  assert.match(formatLatency(s), /caller hears ~1370 ms/);
});

test('a reply with no caller turn (greeting) is not counted; overlapping speech skips the echo', () => {
  let t = 0;
  const probe = createLatencyProbe({ now: () => t });
  probe.onAgentState('speaking');                                         // greeting on a quiet line
  probe.onCallerFrame({ rms: 0.3, at: 300 });                             // its echo: one sample
  t = 900; probe.onAgentState('listening');
  probe.onCallerFrame({ rms: 0.1, at: 1000 });
  t = 1050; probe.onAgentState('speaking');                               // caller was just talking
  probe.onCallerFrame({ rms: 0.3, at: 1300 });                            // not a clean echo onset
  const s = probe.summary();
  assert.equal(s.turns, 0);
  assert.equal(s.bridgeSamples, 1);
});
