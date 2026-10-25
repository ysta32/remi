// Animated avatar (LemonSlice). The avatar joins the call's room as its own participant
// and publishes both Remi's voice and face; Remi's audio streams to it instead of the
// room, so the Mac still sees exactly one participant with audio and video
// (chert guide video: AVATARS). Started only once a caller is in the room, never in the
// waiting room, because every avatar session is billed.
//
// On when LEMONSLICE_API_KEY and LEMONSLICE_AGENT_ID are set; AVATAR=off turns it off.
// Any failure leaves the call on Remi's own drawn face and voice.
import * as lemonslice from '@livekit/agents-plugin-lemonslice';

const unset = (v) => /^(?:YOUR_|<|$)/.test(String(v ?? '').trim());

export function avatarEnabled(env = process.env) {
  return String(env.AVATAR ?? '').trim().toLowerCase() !== 'off'
    && !unset(env.LEMONSLICE_API_KEY) && !unset(env.LEMONSLICE_AGENT_ID);
}

/**
 * Start the avatar before AgentSession.start(). Resolves { ok, sessionId?, ms, detail? };
 * never throws. One attempt, bounded by timeoutMs, so the greeting window stays safe.
 */
export async function startAvatar({ session, room, env = process.env, timeoutMs = 7000, log = () => {} }) {
  const t0 = Date.now();
  try {
    const avatar = new lemonslice.AvatarSession({
      agentId: env.LEMONSLICE_AGENT_ID.trim(),
      apiKey: env.LEMONSLICE_API_KEY.trim(),
      ...(unset(env.LEMONSLICE_PROMPT) ? {} : { agentPrompt: env.LEMONSLICE_PROMPT }),
      // Leave if nothing is said for 5 minutes; the room closing ends it sooner.
      idleTimeout: Number.parseInt(env.LEMONSLICE_IDLE_TIMEOUT, 10) || 300,
      connOptions: { maxRetry: 0, retryIntervalMs: 500, timeoutMs },
    });
    const sessionId = await avatar.start(session, room);
    log(`[avatar] lemonslice session ${sessionId} started (${Date.now() - t0} ms)`);
    return { ok: true, sessionId, ms: Date.now() - t0 };
  } catch (err) {
    const detail = String(err?.message ?? err).slice(0, 200);
    log(`[avatar] lemonslice unavailable (${detail}); using Remi's own face and voice`);
    return { ok: false, detail, ms: Date.now() - t0 };
  }
}
