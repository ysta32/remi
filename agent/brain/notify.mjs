// Outbound alerts: iMessage to the emergency contact via the Chert SDK CLI, and
// an optional emergency-dispatch webhook. Neither ever throws; both resolve to
// { ok, detail }. Never log message bodies or phone numbers in full.
//
// Uses the same `chert-sdk imessage send` invocation as tools/chert-agent.mjs.
// Needs CHERT_BASE_URL and CHERT_API_KEY in the agent's environment.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SDK_PKG = '@trychert/sdk@0.1.0';

export function maskPhone(phone) {
  return phone ? `***${String(phone).slice(-4)}` : 'none';
}

function sdkCommand(args) {
  const local = join(HERE, '..', 'node_modules', '.bin', 'chert-sdk');
  if (existsSync(local)) return [local, args];
  return ['npx', ['--yes', '--package', SDK_PKG, 'chert-sdk', ...args]];
}

function runOnce(args, timeoutMs) {
  return new Promise((resolve) => {
    const [cmd, argv] = sdkCommand(args);
    let stdout = '';
    let settled = false;
    let timer;
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    let child;
    try {
      child = spawn(cmd, argv, { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) {
      return done({ ok: false, detail: `spawn failed: ${err.message}` });
    }
    timer = setTimeout(() => { child.kill('SIGTERM'); done({ ok: false, detail: `timed out after ${timeoutMs} ms` }); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', (err) => done({ ok: false, detail: `spawn error: ${err.message}` }));
    child.on('close', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch { /* not JSON */ }
      done(code === 0 && parsed
        ? { ok: true, detail: 'queued (not proof of delivery)' }
        : { ok: false, detail: `chert-sdk exit ${code}` });
    });
  });
}

/**
 * Send one iMessage. Retries once with the SAME idempotency key, so the
 * service can de-duplicate if the first attempt actually went through.
 */
export async function sendIMessage({ phone, body, idempotencyKey, timeoutMs = 20000 }) {
  const args = ['imessage', 'send', '--phone', phone, '--body', body, '--idempotency-key', idempotencyKey];
  const first = await runOnce(args, timeoutMs);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 2000));
  return runOnce(args, timeoutMs);
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
