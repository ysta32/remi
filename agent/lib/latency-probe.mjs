// Where reply latency goes, per caller turn. Every timestamp is this worker's clock:
//   voice end   last loud caller frame on the tap (already delayed by FaceTime uplink)
//   vad         OpenAI input_audio_buffer.speech_stopped arrives (silence wait + network)
//   created     response.created arrives
//   first audio first response audio delta arrives (model time to first audio)
//   speaking    agent state "speaking": first frame handed to LiveKit
// The FaceTime bridge is timed from the echo of Remi's own voice: Remi starts speaking
// here, it plays on the phone, the phone mic hears it and it comes back on the caller
// track. That round trip (agent → Mac → FaceTime → phone → FaceTime → Mac → agent) is
// what the bridge adds to every reply; Hal hears about speaking + half of it.
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

export function createLatencyProbe({ log = () => {}, now = Date.now } = {}) {
  let floor = 0.004;          // caller-line noise floor while nobody talks
  let lastVoiceAt = null;
  let agentSpeaking = false;
  let speakingAt = null;
  let echoPending = false;
  let turn = null;            // {stopped, created, firstAudio}
  const turns = [];
  const rtts = [];

  function onCallerFrame({ rms, at = now() }) {
    if (agentSpeaking) {
      if (!echoPending) return;
      const since = at - speakingAt;
      if (since > 2000) { echoPending = false; return; }
      if (rms > Math.max(0.006, floor * 4)) {
        echoPending = false;
        rtts.push(since);
        log(`[lat] bridge round trip ${since} ms (echo of Remi's voice on the caller track)`);
      }
      return;
    }
    if (rms > Math.max(0.006, floor * 3)) lastVoiceAt = at;
    else floor += (rms < floor ? 0.05 : 0.002) * (rms - floor);
  }

  function onServerEvent(ev) {
    const t = now();
    switch (ev?.type) {
      case 'input_audio_buffer.speech_stopped': turn = { stopped: t, voiceEnd: lastVoiceAt }; break;
      case 'response.created': if (turn && !turn.created) turn.created = t; break;
      case 'response.output_audio.delta':
      case 'response.audio.delta': if (turn?.created && !turn.firstAudio) turn.firstAudio = t; break;
      default:
    }
  }

  function onAgentState(state) {
    const t = now();
    if (state !== 'speaking') { agentSpeaking = false; return; }
    agentSpeaking = true;
    speakingAt = t;
    // Only a clean start (caller quiet for 300 ms) gives a clean echo onset.
    echoPending = lastVoiceAt === null || t - lastVoiceAt > 300;
    if (!turn?.created || !turn.firstAudio) { turn = null; return; }
    const r = {
      endpoint: turn.voiceEnd ? turn.stopped - turn.voiceEnd : null,
      respond: turn.created - turn.stopped,
      model: turn.firstAudio - turn.created,
      playout: t - turn.firstAudio,
      total: turn.voiceEnd ? t - turn.voiceEnd : null,
    };
    turns.push(r);
    turn = null;
    log(`[lat] turn: endpoint ${r.endpoint ?? '-'} + respond ${r.respond} + model ${r.model} + playout ${r.playout} = ${r.total ?? '-'} ms after voice end`);
  }

  function summary() {
    const pick = (k) => median(turns.map((x) => x[k]).filter((v) => v !== null));
    return {
      turns: turns.length,
      endpoint: pick('endpoint'), respond: pick('respond'), model: pick('model'), playout: pick('playout'),
      total: pick('total'), bridgeRtt: median(rtts), bridgeSamples: rtts.length,
    };
  }

  return { onCallerFrame, onServerEvent, onAgentState, summary };
}

export function formatLatency(s) {
  const heard = s.total !== null && s.bridgeRtt !== null ? s.total + s.bridgeRtt : null;
  return `${s.turns} turns, medians: endpoint ${s.endpoint ?? '-'} ms, respond ${s.respond ?? '-'} ms, model ${s.model ?? '-'} ms, playout ${s.playout ?? '-'} ms, agent total ${s.total ?? '-'} ms; bridge round trip ${s.bridgeRtt ?? '-'} ms (${s.bridgeSamples} samples); caller hears ~${heard ?? '-'} ms`;
}
