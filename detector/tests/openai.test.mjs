import test from 'node:test';
import assert from 'node:assert/strict';
import { postOpenAI } from '../src/openai.mjs';
const key = 'synthetic-test-key';
const ok = () => Response.json({ object: 'list', data: [] });
const options = (fetchImpl, extra = {}) => ({ apiKey: key, fetchImpl, ...extra });
const safeError = (code) => (error) => {
  assert.equal(error.code, code);
  assert.equal(error.name, 'DetectorError');
  assert.doesNotMatch(JSON.stringify(error) + error.stack, /PRIVATE|synthetic-test-key/);
  assert.equal(error.cause, undefined);
  return true;
};

test('POST uses fixed OpenAI endpoint and protected redirect/header settings', async () => {
  let request;
  const result = await postOpenAI('/embeddings', { input: ['hello'] }, options(async (url, init) => {
    request = { url, ...init };
    return ok();
  }));
  assert.deepEqual(result, { object: 'list', data: [] });
  assert.equal(request.url, 'https://api.openai.com/v1/embeddings');
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers.Authorization, `Bearer ${key}`);
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body), { input: ['hello'] });
  assert.ok(request.signal instanceof AbortSignal);
});

for (const patch of [{ apiKey: '' }, { apiKey: undefined }, { timeoutMs: 0 }, { timeoutMs: 120001 }, { timeoutMs: NaN }, { maxRetries: 2 }, { maxRetries: -1 }, { maxRetries: 0.5 }, { fetchImpl: 42 }]) {
  test(`rejects invalid provider configuration ${JSON.stringify(patch)}`, async () => {
    let called = false;
    await assert.rejects(() => postOpenAI('/responses', {}, options(async () => { called = true; return ok(); }, patch)), safeError('CONFIGURATION_ERROR'));
    assert.equal(called, false);
  });
}

test('refuses an arbitrary provider URL before sending credentials', async () => {
  let called = false;
  await assert.rejects(() => postOpenAI('https://example.com/PRIVATE', {}, options(async () => { called = true; return ok(); })), safeError('CONFIGURATION_ERROR'));
  assert.equal(called, false);
});

for (const transient of ['network', 429, 500, 503]) {
  test(`retries transient ${transient} exactly once and returns decoded response`, async () => {
    let calls = 0;
    const result = await postOpenAI('/responses', {}, options(async () => {
      calls++;
      if (calls === 1) {
        if (transient === 'network') throw new TypeError('PRIVATE network');
        return new Response('PRIVATE provider body', { status: transient });
      }
      return ok();
    }));
    assert.equal(calls, 2);
    assert.deepEqual(result.data, []);
  });
}

test('persistent failures stop after at most one retry with private errors', async () => {
  let calls = 0;
  await assert.rejects(() => postOpenAI('/responses', { transcript: 'PRIVATE' }, options(async () => {
    calls++; throw new Error('PRIVATE synthetic-test-key');
  })), safeError('PROVIDER_ERROR'));
  assert.equal(calls, 2);
});

for (const status of [400, 401, 403, 404]) {
  test(`does not retry permanent HTTP ${status}`, async () => {
    let calls = 0;
    await assert.rejects(() => postOpenAI('/responses', {}, options(async () => {
      calls++; return new Response('PRIVATE', { status });
    })), safeError('PROVIDER_ERROR'));
    assert.equal(calls, 1);
  });
}

test('maxRetries zero disables transient retry', async () => {
  let calls = 0;
  await assert.rejects(() => postOpenAI('/responses', {}, options(async () => {
    calls++; return new Response('PRIVATE', { status: 503 });
  }, { maxRetries: 0 })), safeError('PROVIDER_ERROR'));
  assert.equal(calls, 1);
});

test('invalid JSON body is sanitized without retry', async () => {
  let calls = 0;
  await assert.rejects(() => postOpenAI('/responses', {}, options(async () => {
    calls++; return new Response('PRIVATE broken JSON');
  })), safeError('INVALID_RESPONSE'));
  assert.equal(calls, 1);
});

for (const phase of ['fetch', 'body']) {
  test(`timeout bounds the entire ${phase} even when transport ignores abort`, async () => {
    let calls = 0;
    let signal;
    const start = Date.now();
    await assert.rejects(() => postOpenAI('/responses', {}, options(async (_url, init) => {
      calls++; signal = init.signal;
      if (phase === 'fetch') return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} }));
    }, { timeoutMs: 20 })), safeError('PROVIDER_TIMEOUT'));
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
    assert.ok(Date.now() - start < 1000);
  });
}

test('retries a transient network failure while consuming the response body', async () => {
  let calls = 0;
  const result = await postOpenAI('/responses', {}, options(async () => {
    calls++;
    if (calls === 1) return new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError('PRIVATE connection terminated')); },
    }));
    return ok();
  }));
  assert.equal(calls, 2);
  assert.deepEqual(result.data, []);
});
