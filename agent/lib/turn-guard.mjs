// Who has the floor. Three jobs, all from caller-audio energy (lib/caller-audio.mjs):
//
// 1. Echo guard. In @livekit/agents 1.8.0 every realtime input_speech_started interrupts
//    the agent (agent_activity.js onInputSpeechStarted), so FaceTime echo of Remi's own
//    voice cut replies off ~2 s in. While Remi speaks, the model's caller input is
//    detached. It also starts detached until the greeting has played, so FaceTime
//    connecting noise can't open a caller turn that delays the greeting.
// 2. Barge-in. While detached we still meter the caller. Echo is quiet and steady; a
//    person talking over Remi is several times louder than the echo floor measured in
//    this same reply. Sustained speech above that interrupts Remi and reattaches input,
//    so "stop" or a new question works even mid-reply.
// 3. Stuck turn. If the model thinks the caller is still talking but the line has been
//    at its noise floor for STUCK_SILENCE_MS, room noise is holding the turn open:
//    commit the audio so Remi answers instead of waiting forever.
//
// BARGE_IN=0 disables (2). ECHO_GUARD=0 disables (1) and (2): plain full duplex.
import { voice } from '@livekit/agents';

const FRAME_MS = 20;

export function createTurnGuard(session, opts = {}) {
  const {
    echoGuard = true,
    bargeIn = true,
    tailMs = 450,            // echo tail after Remi stops
    startDeafMs = 20000,     // open the mic anyway if Remi never greets
    bargeMinRms = 0.02,      // never barge in below this (-34 dBFS)
    bargeRatio = 3.5,        // ...or below this multiple of the echo floor
    bargeHoldMs = 280,       // sustained speech needed to barge in
    onsetIgnoreMs = 250,     // ignore the first moments of each reply (echo onset)
    stuckSilenceMs = 1600,
    log = () => {},
  } = opts;

  const S = voice.AgentSessionEventTypes;
  let agentSpeaking = false;
  let speakingSince = 0;
  let userSpeaking = false;
  let tail = null;
  let deaf = null;
  // Echo floor for the current reply, and a slow noise floor for the line.
  let echoFloor = 0;
  let echoPeak = 0;
  let hot = 0;
  let noiseFloor = 0.004;
  let quietMs = 0;
  const stats = { replies: 0, bargeIns: 0, stuckCommits: 0 };

  const drop = () => { try { session.clearUserTurn(); } catch { /* nothing buffered */ } };
  const attach = (on) => { if (session.input.audioEnabled !== on) session.input.setAudioEnabled(on); };

  function listen() {
    tail = null;
    if (deaf) { clearTimeout(deaf); deaf = null; }
    drop();
    attach(true);
  }

  if (echoGuard) {
    attach(false);
    deaf = setTimeout(() => { deaf = null; if (!agentSpeaking && !tail) listen(); }, startDeafMs);
  }

  function onAgentState(ev) {
    if (ev.newState === 'speaking') {
      agentSpeaking = true;
      speakingSince = Date.now();
      echoFloor = 0; echoPeak = 0; hot = 0;
      stats.replies += 1;
      if (tail) { clearTimeout(tail); tail = null; }
      if (echoGuard) { attach(false); drop(); }
    } else if (ev.oldState === 'speaking') {
      agentSpeaking = false;
      if (echoGuard) {
        log(`[turn] reply ${stats.replies} done: echo floor ${echoFloor.toFixed(4)} peak ${echoPeak.toFixed(4)}`);
        if (tail) clearTimeout(tail);
        tail = setTimeout(listen, tailMs);
      }
    }
  }
  function onUserState(ev) {
    userSpeaking = ev.newState === 'speaking';
    quietMs = 0;
  }
  session.on(S.AgentStateChanged, onAgentState);
  session.on(S.UserStateChanged, onUserState);

  /** Feed every caller frame from the audio tap. */
  function onCallerFrame({ rms }) {
    if (agentSpeaking) {
      if (!echoGuard || !bargeIn) return;
      if (Date.now() - speakingSince < onsetIgnoreMs) return;
      // Robust floor: follow quiet frames quickly, loud frames barely.
      echoFloor = echoFloor === 0 ? rms : echoFloor + (rms < echoFloor * 2 ? 0.08 : 0.005) * (rms - echoFloor);
      echoPeak = Math.max(echoPeak, rms);
      const loud = rms > Math.max(bargeMinRms, echoFloor * bargeRatio);
      hot = loud ? hot + FRAME_MS : Math.max(0, hot - FRAME_MS / 2);
      if (hot >= bargeHoldMs) {
        hot = 0;
        stats.bargeIns += 1;
        log(`[turn] barge-in: caller ${rms.toFixed(4)} over echo floor ${echoFloor.toFixed(4)}`);
        try { session.interrupt(); } catch (err) { log(`[turn] interrupt: ${err.message}`); }
        agentSpeaking = false;
        if (tail) { clearTimeout(tail); tail = null; }
        if (deaf) { clearTimeout(deaf); deaf = null; }
        attach(true);   // keep the caller's words: no clearUserTurn here
      }
      return;
    }
    // Line noise floor, from frames while Remi is quiet.
    noiseFloor += (rms < noiseFloor ? 0.05 : 0.002) * (rms - noiseFloor);
    if (!userSpeaking || !session.input.audioEnabled) return;
    const silent = rms < noiseFloor * 1.8 + 0.002;
    quietMs = silent ? quietMs + FRAME_MS : 0;
    if (quietMs >= stuckSilenceMs) {
      quietMs = 0;
      stats.stuckCommits += 1;
      log(`[turn] caller turn stuck open on noise (floor ${noiseFloor.toFixed(4)}); committing`);
      commitTurn();
    }
  }

  // The realtime session is internal to AgentActivity in 1.8.0; reach it defensively.
  function commitTurn() {
    const rt = session.activity?.realtimeSession;
    Promise.resolve(rt?.commitAudio?.())
      .then(() => { try { session.generateReply(); } catch (err) { log(`[turn] reply: ${err.message}`); } })
      .catch((err) => log(`[turn] commit: ${err.message}`));
  }

  return {
    onCallerFrame,
    stats,
    stop() {
      session.off(S.AgentStateChanged, onAgentState);
      session.off(S.UserStateChanged, onUserState);
      if (tail) clearTimeout(tail);
      if (deaf) clearTimeout(deaf);
    },
  };
}
