// Animated avatar (LemonSlice). The avatar joins the call's room as its own participant
// and publishes both Remi's voice and face; Remi's audio streams to it instead of the
// room, so the Mac still sees exactly one participant with audio and video
// (chert guide video: AVATARS). Started only once a caller is in the room, never in the
// waiting room, because every avatar session is billed.
//
// On when LEMONSLICE_API_KEY and LEMONSLICE_AGENT_ID are set; AVATAR=off turns it off.
// Any failure leaves the call on Remi's own drawn face and voice.
import * as lemonslice from '@livekit/agents-plugin-lemonslice';
import { RoomServiceClient } from 'livekit-server-sdk';

const unset = (v) => /^(?:YOUR_|<|$)/.test(String(v ?? '').trim());

export function avatarEnabled(env = process.env) {
  return String(env.AVATAR ?? '').trim().toLowerCase() !== 'off'
    && !unset(env.LEMONSLICE_API_KEY) && !unset(env.LEMONSLICE_AGENT_ID);
}

export function avatarFraming(env = process.env) {
  const variant = unset(env.LEMONSLICE_FRAMING) ? 'off' : env.LEMONSLICE_FRAMING.trim().toLowerCase();
  if (variant === 'off') return { aspectRatio: '2x3' };
  return { aspectRatio: '2x3', editImage: true, editImageVariant: variant };
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
      // The Chert Mac shows our video "fit" in a landscape (>=1280x720) window, so the
      // avatar is only ever as tall as that picture; the frame shape doesn't make her bigger.
      // A tighter crop does: LemonSlice can reframe the image as a close-up before the call
      // (editImage, 2x3 only), but that took over 7 s, past the greeting window, so it is off
      // unless LEMONSLICE_FRAMING=portrait|bust|sitting|standing. Better: a close-up agent image.
      extraPayload: avatarFraming(env),
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

/**
 * After a failed or timed-out start, LemonSlice may still join later and publish audio next
 * to Remi's own; two audio publishers make the Mac end the call. Remove it if it shows up.
 */
export function keepAvatarOut(room, { env = process.env, identity = 'lemonslice-avatar-agent', log = () => {} } = {}) {
  const kick = (p) => {
    if (p?.identity !== identity) return;
    log(`[avatar] late ${identity} joined after fallback; removing it`);
    new RoomServiceClient(env.LIVEKIT_URL.replace(/^ws/, 'http'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET)
      .removeParticipant(room.name, identity)
      .catch((err) => log(`[avatar] remove failed: ${err.message}`));
  };
  room.on('participantConnected', kick);
  for (const p of room.remoteParticipants?.values?.() ?? []) kick(p);
  return () => room.off('participantConnected', kick);
}
