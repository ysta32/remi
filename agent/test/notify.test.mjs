import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendIMessage } from '../brain/notify.mjs';

const env = { CHERT_API_KEY: 'test-secret' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return responses.shift(); };
  return { fetch, calls };
}

test('sends through the documented /api/v1/send route', async () => {
  const { fetch, calls } = fakeFetch([reply(200, { status: 'sent', message_id: 'm1', chat_id: 'c1' })]);
  const r = await sendIMessage({ phone: '+12155550142', body: 'Hi', idempotencyKey: 'k1', env, fetch });
  assert.equal(r.ok, true);
  assert.equal(r.messageId, 'm1');
  assert.equal(calls[0].url, 'https://console.trychert.com/api/v1/send');
  assert.deepEqual(calls[0].body, { phone: '+12155550142', body: 'Hi', idempotency_key: 'k1' });
});

test('an auth failure is not retried', async () => {
  const { fetch, calls } = fakeFetch([reply(401, { error: 'unauthorized', code: 'auth_failed' })]);
  const r = await sendIMessage({ phone: '+12155550142', body: 'Hi', env, fetch, retryDelayMs: 0 });
  assert.equal(r.ok, false);
  assert.match(r.detail, /auth_failed/);
  assert.equal(calls.length, 1);
});

test('a retryable failure retries once with the same idempotency key', async () => {
  const { fetch, calls } = fakeFetch([
    reply(503, { status: 'failed', error: 'send_failed', code: 4002, retryable: true }),
    reply(202, { status: 'queued', message_id: 'm2', chat_id: 'c2' }),
  ]);
  const r = await sendIMessage({ phone: '+12155550142', body: 'Hi', idempotencyKey: 'k2', env, fetch, retryDelayMs: 0 });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.idempotency_key, 'k2');
});
