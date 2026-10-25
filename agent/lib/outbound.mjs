// Remi places a FaceTime call (Chert customer_managed outbound, @trychert/sdk 0.2.0):
//   1. a fresh LiveKit room with Remi dispatched into it (agent name from AGENT_NAME)
//   2. a join token for the FaceTime bridge, identity chert-bridge-<id> like inbound calls
//   3. createCall on our line; poll its events
//   4. on bridge_ready, set {"chert_bridge_ready":true} on the room, the same signal chert dev
//      sets for inbound calls, so Remi greets exactly as she does there.
// Progress goes to onStatus; no phone numbers or credentials are ever logged in full.
import { randomUUID } from 'node:crypto';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { ChertControlPlane } from '@trychert/sdk/facetime';
import { isUnset } from './env.mjs';

const TERMINAL = new Set(['ended', 'failed', 'rejected']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The FaceTime project key (ftk_...). Anish's setup puts it in CHERT_API_KEY, so accept either.
export function facetimeToken(env = process.env) {
  if (/^ftk/.test(String(env.CHERT_FACETIME_TOKEN ?? '').trim())) return env.CHERT_FACETIME_TOKEN.trim();
  if (/^ftk/.test(String(env.CHERT_API_KEY ?? '').trim())) return env.CHERT_API_KEY.trim();
  return isUnset(env.CHERT_FACETIME_TOKEN) ? null : env.CHERT_FACETIME_TOKEN;
}

/** Names of settings an outbound call needs that are missing. */
export function missingCallConfig(env = process.env) {
  return [
    ...['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].filter((k) => isUnset(env[k])),
    ...(facetimeToken(env) ? [] : ['CHERT_FACETIME_TOKEN']),
    ...(isUnset(env.CHERT_PROJECT_ID) ? ['CHERT_PROJECT_ID'] : []),
  ];
}

export function normalizeDestination(to) {
  const s = String(to ?? '').trim();
  if (s.includes('@')) return { destination: s, destination_type: 'email' };
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return { destination: `+1${digits}`, destination_type: 'phone' };
  if (digits.length === 11 && digits.startsWith('1')) return { destination: `+${digits}`, destination_type: 'phone' };
  if (s.startsWith('+') && digits.length >= 8) return { destination: `+${digits}`, destination_type: 'phone' };
  throw new Error('destination must be a phone number or an Apple ID email');
}

export async function placeCall({ to, video = true, env = process.env, onStatus = () => {}, maxMs = 30 * 60_000, signal } = {}) {
  const missing = missingCallConfig(env);
  if (missing.length) throw new Error(`missing settings: ${missing.join(', ')}`);
  const dest = normalizeDestination(to);
  const host = env.LIVEKIT_URL.replace(/^ws/, 'http');
  const rooms = new RoomServiceClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const dispatch = new AgentDispatchClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const facetime = new ChertControlPlane({
    token: facetimeToken(env),
    projectId: env.CHERT_PROJECT_ID,
    ...(isUnset(env.CHERT_FACETIME_URL) ? {} : { baseUrl: env.CHERT_FACETIME_URL }),
  });

  let lineId = isUnset(env.CHERT_LINE_ID) ? null : env.CHERT_LINE_ID;
  if (!lineId) {
    const lines = (await facetime.listLines()).data ?? [];
    const line = lines.find((l) => l.supports_audio !== false) ?? lines[0];
    if (!line) throw new Error('no FaceTime line on this project');
    lineId = line.id;
  }

  const id = randomUUID();
  const room = `remi-out-${id.slice(0, 8)}`;
  const identity = `chert-bridge-out-${id.slice(0, 8)}`;
  await rooms.createRoom({ name: room, emptyTimeout: 120, departureTimeout: 20 });
  await dispatch.createDispatch(room, env.AGENT_NAME || 'remi', { metadata: JSON.stringify({ outbound: true }) });
  onStatus({ step: 'room_ready', room });

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity, ttl: '2h' });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  const call = await facetime.createCall({
    direction: 'outbound',
    mode: 'customer_managed',
    line_id: lineId,
    ...dest,
    media: { audio: true, video: Boolean(video) },
    livekit_url: env.LIVEKIT_URL,
    participant_token: await at.toJwt(),
    remote_participant_identity: identity,
  }, `remi-out-${id}`);
  onStatus({ step: 'dialing', callId: call.id, status: call.status, to: `***${dest.destination.slice(-4)}` });

  const seen = new Set();
  let signalled = false;
  const t0 = Date.now();
  let status = call.status;
  while (!TERMINAL.has(status) && Date.now() - t0 < maxMs && !signal?.aborted) {
    await sleep(700);
    let events = [];
    try { ({ events } = await facetime.getCallEvents(call.id)); } catch (err) { onStatus({ step: 'poll_error', error: err.message }); continue; }
    for (const ev of events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      onStatus({ step: 'event', type: ev.type });
      if (ev.type === 'bridge_ready' && !signalled) {
        signalled = true;
        await rooms.updateRoomMetadata(room, JSON.stringify({ chert_bridge_ready: true, outbound: true }));
        onStatus({ step: 'bridge_ready' });
      }
      if (TERMINAL.has(ev.type)) status = ev.type;
    }
  }
  if (signal?.aborted && !TERMINAL.has(status)) {
    try { await facetime.endCall(call.id, `remi-end-${id}`, { reason: 'ended from control panel' }); } catch { /* reconcile below */ }
  }
  const final = await facetime.getCall(call.id).catch(() => null);
  onStatus({ step: 'done', callId: call.id, status: final?.status ?? status, reason: final?.terminal_reason ?? null });
  return { callId: call.id, room, status: final?.status ?? status };
}

/** Ends a call placed earlier (by Chert call id). */
export async function endCall(callId, env = process.env) {
  const facetime = new ChertControlPlane({ token: facetimeToken(env), projectId: env.CHERT_PROJECT_ID });
  return facetime.endCall(callId, `remi-end-${callId}`, { reason: 'ended from control panel' });
}
