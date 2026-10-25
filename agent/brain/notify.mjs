// Outbound alerts: iMessage via the Chert SDK (@trychert/sdk 0.2.0, in process), and
// an optional emergency-dispatch webhook. Neither ever throws; both resolve to
// { ok, detail }. Never log message bodies or phone numbers in full.
//
// Needs CHERT_API_KEY; CHERT_BASE_URL is optional (the SDK defaults to console.trychert.com).
import { ChertClient } from '@trychert/sdk/imessage';

const PLACEHOLDER = /^(?:YOUR_|<|$)/;
const unset = (v) => PLACEHOLDER.test(String(v ?? '').trim());

/** Names of the iMessage settings that are missing or still template placeholders. */
export function missingTextConfig(env = process.env) {
  return ['CHERT_API_KEY'].filter((k) => unset(env[k]));
}

export function maskPhone(phone) {
  return phone ? `***${String(phone).slice(-4)}` : 'none';
}

async function sendOnce(client, request, timeoutMs) {
  try {
    const receipt = await client.sendText(request, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: true, detail: `queued (not proof of delivery)`, messageId: receipt.message_id, chatId: receipt.chat_id };
  } catch (err) {
    return { ok: false, detail: `chert ${err.status ?? ''} ${err.code ?? err.name}: ${String(err.message).slice(0, 160)}`.trim() };
  }
}

/**
 * Send one iMessage. Retries once with the SAME idempotency key, so the
 * service can de-duplicate if the first attempt actually went through.
 */
export async function sendIMessage({ phone, body, idempotencyKey, timeoutMs = 20000, env = process.env }) {
  if (unset(env.CHERT_API_KEY)) return { ok: false, detail: 'CHERT_API_KEY is not set' };
  const client = new ChertClient({
    apiKey: env.CHERT_API_KEY,
    ...(unset(env.CHERT_BASE_URL) ? {} : { baseURL: env.CHERT_BASE_URL }),
    ...(unset(env.CHERT_TENANT) ? {} : { tenant: env.CHERT_TENANT }),
  });
  const request = { phone, body, idempotency_key: idempotencyKey };
  const first = await sendOnce(client, request, timeoutMs);
  if (first.ok || /\b4\d\d\b/.test(first.detail)) return first;   // a 4xx won't fix itself
  await new Promise((r) => setTimeout(r, 2000));
  return sendOnce(client, request, timeoutMs);
}

/**
 * POST an emergency to a dispatch provider's webhook (SAFETY_MODE=911).
 * The payload shape is ours; adapt it in one place when a provider is chosen.
 */
export async function dispatchEmergency({ url, token, payload, timeoutMs = 5000 }) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? { ok: true, detail: `HTTP ${res.status}` } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err.name === 'TimeoutError' ? 'timed out' : err.message };
  }
}
