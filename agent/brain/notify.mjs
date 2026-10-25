// Outbound alerts: iMessage via the Chert Messaging API (POST /api/v1/send through the
// @trychert/sdk 0.2.0 client; its sendText() targets /text-operations/v1, which 404s), and
// an optional emergency-dispatch webhook. Neither ever throws; both resolve to
// { ok, detail }. Never log message bodies or phone numbers in full.
//
// Needs CHERT_API_KEY (the tenant's messaging signing secret); CHERT_BASE_URL is optional
// (the SDK defaults to console.trychert.com/api/v1).
import { execFile } from 'node:child_process';
import { ChertClient } from '@trychert/sdk/imessage';

const PLACEHOLDER = /^(?:YOUR_|<|$)/;
const unset = (v) => PLACEHOLDER.test(String(v ?? '').trim());

/** Names of the iMessage settings that are missing or still template placeholders. */
export function missingTextConfig(env = process.env) {
  const via = textProviders(env);
  if (via.includes('messages') || (via.includes('shared') && sharedKey(env) && !unset(env.CHERT_PROJECT_ID))) return [];
  return ['CHERT_API_KEY'].filter((k) => unset(env[k]));
}

export function maskPhone(phone) {
  return phone ? `***${String(phone).slice(-4)}` : 'none';
}

// TEXT_VIA=messages: send from this Mac's Messages app (the signed-in Apple ID) instead of
// Chert. Phone and body go in as osascript arguments, never spliced into the script.
// TEXT_VIA is an ordered, comma-separated list of senders to try:
//   shared   Chert FaceTime shared line (POST facetime.trychert.com/api/v1/shared-messages; ftk_ key,
//            texts only to phones verified on the project)
//   chert    Chert Messaging API (/send with a tenant signing secret)
//   messages this Mac's Messages app
// Unset: shared when an ftk_ key is present, otherwise chert.
const sharedKey = (env) => [env.CHERT_API_KEY, env.CHERT_FACETIME_TOKEN].find((v) => /^ftk/.test(String(v ?? '').trim()))?.trim();
export function textProviders(env = process.env) {
  const list = String(env.TEXT_VIA ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : [sharedKey(env) ? 'shared' : 'chert'];
}
const MESSAGES_SCRIPT = `on run argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    send (item 2 of argv) to participant (item 1 of argv) of svc
  end tell
end run`;

export function sendViaMessagesApp({ phone, body, timeoutMs = 20000, run = execFile }) {
  return new Promise((resolve) => {
    run('osascript', ['-e', MESSAGES_SCRIPT, String(phone), String(body)], { timeout: timeoutMs }, (err, _out, stderr) => {
      if (!err) return resolve({ ok: true, detail: 'handed to Messages.app (not proof of delivery)' });
      resolve({ ok: false, detail: `messages.app ${err.killed ? 'timed out' : String(stderr || err.message).trim().slice(0, 160)}` });
    });
  });
}

async function sendOnce(client, request, timeoutMs) {
  try {
    const { status, data } = await client.requestWithResponse('/send', { method: 'POST', body: request, signal: AbortSignal.timeout(timeoutMs) });
    if (data?.status === 'sent' || data?.status === 'queued') {
      return { ok: true, detail: `${data.status} (HTTP ${status}; not proof of delivery)`, messageId: data.message_id, chatId: data.chat_id };
    }
    return { ok: false, detail: `chert ${status} ${data?.error ?? 'unexpected'} ${data?.code ?? ''}`.trim(), retryable: data?.retryable === true };
  } catch (err) {
    const d = err.data;
    const code = d?.code ?? err.code ?? err.name;
    return {
      ok: false,
      detail: `chert ${err.status ?? ''} ${code}${d?.reason ? `: ${String(d.reason).slice(0, 160)}` : ''}`.trim(),
      retryable: d?.retryable ?? !(err.status >= 400 && err.status < 500),
    };
  }
}

/**
 * Send one iMessage through the TEXT_VIA senders in order; first success wins. Chert Messaging retries once with the SAME idempotency key, so the
 * service can de-duplicate if the first attempt actually went through.
 */
export async function sendIMessage(opts) {
  const tried = [];
  for (const via of textProviders(opts.env ?? process.env)) {
    const r = via === 'shared' ? await sendViaSharedLine(opts)
      : via === 'messages' ? await sendViaMessagesApp({ phone: opts.phone, body: opts.body, timeoutMs: opts.timeoutMs, ...(opts.run ? { run: opts.run } : {}) })
      : via === 'chert' ? await sendViaChertMessaging(opts)
      : { ok: false, detail: `unknown TEXT_VIA ${via}` };
    if (r.ok) return { ...r, via, ...(tried.length ? { detail: `${r.detail}; after ${tried.join('; ')}` } : {}) };
    tried.push(`${via}: ${r.detail}`);
  }
  return { ok: false, detail: tried.join('; ') };
}

const lineCache = new Map();
async function sharedLineId(base, headers, f, timeoutMs, env) {
  const key = headers.authorization;
  if (!unset(env.CHERT_SHARED_LINE_ID)) return env.CHERT_SHARED_LINE_ID.trim();
  if (lineCache.has(key)) return lineCache.get(key);
  const res = await f(`${base}/lines`, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`lines HTTP ${res.status} ${json?.error?.code ?? ''}`.trim());
  const items = Array.isArray(json?.data) ? json.data : json?.data?.items ?? [];
  const id = items.find((l) => l?.id)?.id;
  if (!id) throw new Error('no line on this project');
  lineCache.set(key, id);
  return id;
}

/** Chert FaceTime shared line: text only to phones verified on the project. */
export async function sendViaSharedLine({ phone, body, idempotencyKey, timeoutMs = 20000, env = process.env, fetch: f = globalThis.fetch }) {
  const key = sharedKey(env);
  if (!key) return { ok: false, detail: 'no ftk_ key in CHERT_API_KEY or CHERT_FACETIME_TOKEN' };
  const base = (unset(env.CHERT_FACETIME_URL) ? 'https://facetime.trychert.com' : env.CHERT_FACETIME_URL.trim().replace(/\/$/, '')) + '/api/v1';
  if (unset(env.CHERT_PROJECT_ID)) return { ok: false, detail: 'CHERT_PROJECT_ID is not set' };
  const headers = { authorization: `Bearer ${key}`, 'x-chert-project-id': env.CHERT_PROJECT_ID.trim() };
  try {
    const line_id = await sharedLineId(base, headers, f, timeoutMs, env);
    const res = await f(`${base}/shared-messages`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': idempotencyKey ?? crypto.randomUUID() },
      body: JSON.stringify({ line_id, recipient: phone, text: body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    const state = json?.data?.state;
    if (res.ok && state && state !== 'unknown' && state !== 'failed') return { ok: true, detail: `shared ${state} (HTTP ${res.status}; not proof of delivery)`, messageId: json.data.id };
    return { ok: false, detail: `shared HTTP ${res.status} ${json?.error?.code ?? state ?? ''}`.trim() };
  } catch (err) {
    return { ok: false, detail: `shared ${err.name === 'TimeoutError' ? 'timed out' : err.message}` };
  }
}

async function sendViaChertMessaging({ phone, body, idempotencyKey, timeoutMs = 20000, env = process.env, fetch, retryDelayMs = 2000 }) {
  if (unset(env.CHERT_API_KEY)) return { ok: false, detail: 'CHERT_API_KEY is not set' };
  const client = new ChertClient({
    apiKey: env.CHERT_API_KEY,
    ...(unset(env.CHERT_BASE_URL) ? {} : { baseURL: env.CHERT_BASE_URL }),
    ...(unset(env.CHERT_TENANT) ? {} : { tenant: env.CHERT_TENANT }),
    ...(fetch ? { fetch } : {}),
  });
  const request = { phone, body, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) };
  const first = await sendOnce(client, request, timeoutMs);
  if (first.ok || !first.retryable) return first;   // `retryable` is Chert's authoritative signal
  await new Promise((r) => setTimeout(r, retryDelayMs));
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
