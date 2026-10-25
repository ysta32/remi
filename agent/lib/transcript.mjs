// Builds the contract's utterances[] from the session: text from conversation items,
// timing from the user/agent speaking states. Also logs reply latency (caller stops
// talking -> Remi starts), the number that decides how the call feels.
import { voice } from '@livekit/agents';

export function collectTranscript(session, { t0, log = () => {} }) {
  const S = voice.AgentSessionEventTypes;
  const segs = { caller: [], agent: [] };   // {startMs, endMs|null, used}
  const utterances = [];
  const latencies = [];
  let callerStoppedAt = null;
  const now = () => Math.max(0, Date.now() - t0);

  const open = (who) => segs[who].push({ startMs: now(), endMs: null, used: false });
  const close = (who) => { const s = segs[who].at(-1); if (s && s.endMs === null) s.endMs = now(); };

  const onUser = (ev) => {
    if (ev.newState === 'speaking') open('caller');
    else if (ev.oldState === 'speaking') { close('caller'); callerStoppedAt = Date.now(); }
  };
  const onAgent = (ev) => {
    if (ev.newState === 'speaking') {
      open('agent');
      if (callerStoppedAt) {
        const ms = Date.now() - callerStoppedAt;
        latencies.push(ms);
        log(`[latency] reply started ${ms} ms after the caller stopped`);
        callerStoppedAt = null;
      }
    } else if (ev.oldState === 'speaking') close('agent');
  };
  const onItem = ({ item }) => {
    if (item?.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) return;
    const text = (item.textContent ?? '').trim();
    if (!text) return;
    const speaker = item.role === 'user' ? 'caller' : 'agent';
    const seg = [...segs[speaker]].reverse().find((s) => !s.used) ?? null;
    if (seg) seg.used = true;
    const at = now();
    const u = { speaker, text, startMs: seg?.startMs ?? Math.max(0, at - 2000), endMs: seg?.endMs ?? at };
    u._seg = seg;
    utterances.push(u);
    log(`[${speaker === 'caller' ? 'caller' : 'remi'}] ${text.slice(0, 160)}`);
  };
  session.on(S.UserStateChanged, onUser);
  session.on(S.AgentStateChanged, onAgent);
  session.on(S.ConversationItemAdded, onItem);

  return {
    latencies,
    /** Contract-shaped utterances, ordered by start, ends filled in. */
    utterances() {
      const end = now();
      return utterances
        .map(({ _seg, ...u }) => {
          const endMs = _seg?.endMs ?? u.endMs ?? end;
          return { ...u, endMs: Math.max(u.startMs, endMs) };
        })
        .sort((a, b) => a.startMs - b.startMs);
    },
    stop() {
      session.off(S.UserStateChanged, onUser);
      session.off(S.AgentStateChanged, onAgent);
      session.off(S.ConversationItemAdded, onItem);
    },
  };
}
