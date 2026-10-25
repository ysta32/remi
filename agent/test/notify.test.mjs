import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendIMessage, missingTextConfig } from '../brain/notify.mjs';

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

test('TEXT_VIA=messages sends through Messages.app with phone and body as arguments', async () => {
  const calls = [];
  const run = (cmd, args, opts, cb) => { calls.push({ cmd, args }); cb(null, '', ''); };
  const r = await sendIMessage({ phone: '+15555550123', body: 'Hi "there"', env: { TEXT_VIA: 'messages' }, run });
  assert.equal(r.ok, true);
  assert.equal(calls[0].cmd, 'osascript');
  assert.deepEqual(calls[0].args.slice(2), ['+15555550123', 'Hi "there"']);
  assert.ok(!calls[0].args[1].includes('5555550123'));
  assert.deepEqual(missingTextConfig({ TEXT_VIA: 'messages' }), []);
});

test('Messages.app failure resolves ok:false and never throws', async () => {
  const run = (cmd, args, opts, cb) => cb(Object.assign(new Error('x'), { killed: false }), '', 'Not authorized');
  const r = await sendIMessage({ phone: '+15555550123', body: 'x', env: { TEXT_VIA: 'messages' }, run });
  assert.equal(r.ok, false);
  assert.match(r.detail, /Not authorized/);
});

test('ftk key defaults to the shared line: looks up the line, then posts shared-messages', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/lines')) return new Response(JSON.stringify({ data: { items: [{ id: '11111111-1111-4111-8111-111111111111' }] } }));
    return new Response(JSON.stringify({ data: { id: 'm1', state: 'sent' } }));
  };
  const r = await sendIMessage({ phone: '+15555550123', body: 'hi', idempotencyKey: 'k1', env: { CHERT_API_KEY: 'ftk_test1', CHERT_PROJECT_ID: 'p1' }, fetch });
  assert.equal(r.ok, true);
  assert.equal(r.via, 'shared');
  const post = calls.find((c) => c.url.endsWith('/shared-messages'));
  assert.equal(post.url, 'https://facetime.trychert.com/api/v1/shared-messages');
  assert.equal(post.init.headers['idempotency-key'], 'k1');
  assert.equal(post.init.headers['x-chert-project-id'], 'p1');
  assert.deepEqual(JSON.parse(post.init.body), { line_id: '11111111-1111-4111-8111-111111111111', recipient: '+15555550123', text: 'hi' });
});

test('shared line rejection falls through to the next sender in TEXT_VIA', async () => {
  const fetch = async (url) => url.endsWith('/lines')
    ? new Response(JSON.stringify({ data: [{ id: '22222222-2222-4222-8222-222222222222' }] }))
    : new Response(JSON.stringify({ error: { code: 'recipient_not_verified' } }), { status: 403 });
  const run = (cmd, args, opts, cb) => cb(null, '', '');
  const r = await sendIMessage({ phone: '+15555550199', body: 'x', env: { CHERT_API_KEY: 'ftk_test2', CHERT_PROJECT_ID: 'p2', TEXT_VIA: 'shared,messages' }, fetch, run });
  assert.equal(r.ok, true);
  assert.equal(r.via, 'messages');
  assert.match(r.detail, /recipient_not_verified/);
});
