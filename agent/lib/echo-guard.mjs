// Half-duplex echo guard. In @livekit/agents 1.8.0 every realtime input_speech_started
// interrupts the agent (agent_activity.js onInputSpeechStarted), so FaceTime echo of
// Remi's own voice on the caller track cuts a reply off ~2 s in. While Remi speaks we
// detach caller audio; when Remi stops we wait out the echo tail, drop any half-heard
// turn, and listen again. BARGE_IN=1 turns this off (the caller can interrupt again).
//
// It also starts deaf: FaceTime connecting noise before bridge_ready otherwise opens a
// caller turn that delays the greeting by seconds. Caller audio opens after the first
// thing Remi says, or after startDeafMs if Remi never speaks (no bridge_ready signal).
import { voice } from '@livekit/agents';

export function guardEcho(session, { tailMs = 450, startDeafMs = 20000, log = () => {} } = {}) {
  let timer = null;
  let muted = 0;
  const drop = () => { try { session.clearUserTurn(); } catch { /* nothing buffered */ } };
  session.input.setAudioEnabled(false);
  let deaf = setTimeout(() => { deaf = null; if (!timer) listen(); }, startDeafMs);
  const listen = () => {
    timer = null;
    if (deaf) { clearTimeout(deaf); deaf = null; }
    drop();
    session.input.setAudioEnabled(true);
  };
  const onState = (ev) => {
    if (ev.newState === 'speaking') {
      if (timer) { clearTimeout(timer); timer = null; }
      if (session.input.audioEnabled) { session.input.setAudioEnabled(false); muted += 1; }
      drop();
    } else if (ev.oldState === 'speaking') {
      if (timer) clearTimeout(timer);
      timer = setTimeout(listen, tailMs);
    }
  };
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
  log(`[echo] guard on (tail ${tailMs} ms)`);
  return () => {
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
    if (timer) clearTimeout(timer);
    if (deaf) clearTimeout(deaf);
    return muted;
  };
}
