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
  if (viaMessagesApp(env)) return [];
  return ['CHERT_API_KEY'].filter((k) => unset(env[k]));
}

export function maskPhone(phone) {
  return phone ? `***${String(phone).slice(-4)}` : 'none';
}

// TEXT_VIA=messages: send from this Mac's Messages app (the signed-in Apple ID) instead of
// Chert. Phone and body go in as osascript arguments, never spliced into the script.
const viaMessagesApp = (env) => String(env.TEXT_VIA ?? '').trim().toLowerCase() === 'messages';
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
 * Send one iMessage. Retries once with the SAME idempotency key, so the
 * service can de-duplicate if the first attempt actually went through.
 */
export async function sendIMessage({ phone, body, idempotencyKey, timeoutMs = 20000, env = process.env, fetch, retryDelayMs = 2000, run }) {
  if (viaMessagesApp(env)) return sendViaMessagesApp({ phone, body, timeoutMs, ...(run ? { run } : {}) });
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
