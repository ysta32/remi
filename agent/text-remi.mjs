// Text Remi: replies to iMessages sent to the Chert shared line.
// Polls GET /shared-messages for new inbound texts, writes a short reply as Remi with OpenAI,
// and sends it back on the same line (sendViaSharedLine). Runs beside the call agent; a failure
// here never touches calls.
//
// The API only shows the sender as a masked number, so replies go to the numbers in
// TEXT_REMI_PHONES (comma separated, matched by last 4 digits); others are skipped.
// Chert's shared line carries text only: voice messages and photos don't come through.
//
//   node --env-file=.env.local text-remi.mjs
import { fillSharedEnv, isUnset } from './lib/env.mjs';
import { maskPhone, sendViaSharedLine } from './brain/notify.mjs';

fillSharedEnv();
const env = process.env;
const POLL_MS = 3000;
const MODEL = env.TEXT_MODEL || 'gpt-6.1-sol';
const ELDER = env.ELDER_NAME || 'Hal';
const key = [env.CHERT_API_KEY, env.CHERT_FACETIME_TOKEN].find((v) => /^ftk/.test(String(v ?? '').trim()))?.trim();
const base = (isUnset(env.CHERT_FACETIME_URL) ? 'https://facetime.trychert.com' : env.CHERT_FACETIME_URL.trim().replace(/\/$/, '')) + '/api/v1';
const headers = { authorization: `Bearer ${key}`, 'x-chert-project-id': String(env.CHERT_PROJECT_ID ?? '').trim() };
const phones = String(env.TEXT_REMI_PHONES ?? '').split(',').map((p) => p.replace(/\D/g, '')).filter(Boolean)
  .map((d) => (d.length === 10 ? `+1${d}` : `+${d}`));
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} [text-remi] ${m}`);

const SYSTEM = `You are Remi, a warm AI companion who FaceTimes ${ELDER}, an older man, for a friendly chat every day, and keeps his family close. Someone is texting you on iMessage. Reply like a kind friend texting back: one to three short sentences, plain words, no lists, at most one emoji. If they want to talk, offer to FaceTime. Never give medical advice or say you can diagnose anything; if someone may be in danger, tell them to call 911.`;
const history = new Map();   // phone -> [{role, content}]

async function inbox() {
  const r = await fetch(`${base}/shared-messages`, { headers, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`GET shared-messages HTTP ${r.status}`);
  const j = await r.json();
  const items = Array.isArray(j.data) ? j.data : j.data?.items ?? [];
  return items.filter((m) => m.direction === 'inbound');
}

async function reply(phone, text) {
  const turns = history.get(phone) ?? [];
  turns.push({ role: 'user', content: text });
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, ...turns.slice(-12)] }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  const out = j.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error(`OpenAI HTTP ${r.status} ${j.error?.code ?? ''}`);
  turns.push({ role: 'assistant', content: out });
  history.set(phone, turns.slice(-12));
  return out;
}

async function main() {
  if (!key || isUnset(env.CHERT_PROJECT_ID)) { log('needs an ftk_ key and CHERT_PROJECT_ID'); process.exit(1); }
  if (!phones.length) log('TEXT_REMI_PHONES is empty: texts will be read but not answered');
  const seen = new Set((await inbox()).map((m) => m.id));   // answer only what arrives from now on
  log(`listening (${seen.size} earlier texts skipped; answering ${phones.map(maskPhone).join(', ') || 'nobody'})`);
  for (;;) {
    try {
      for (const m of (await inbox()).reverse()) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const last4 = String(m.masked_recipient ?? '').replace(/\D/g, '').slice(-4);
        const phone = phones.find((p) => p.endsWith(last4));
        if (!phone) { log(`text from ***${last4}: not in TEXT_REMI_PHONES, skipped`); continue; }
        log(`text from ***${last4} (${String(m.text ?? '').length} chars)`);
        const body = await reply(phone, String(m.text ?? ''));
        const sent = await sendViaSharedLine({ phone, body, idempotencyKey: `text-remi-${m.id}`, env });
        log(`reply to ***${last4}: ${sent.ok ? 'sent' : `NOT sent (${sent.detail})`}`);
      }
    } catch (err) {
      log(`error: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
