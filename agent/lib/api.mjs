// The backend client (contracts §4). The live agent, the call simulator and the text
// chat all use this file, so the harnesses exercise the exact requests a call makes.
// Nothing here throws: every call has a short timeout and resolves to a result.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_DIR, TMP_DIR, readConfig } from './config.mjs';

// Last good context per elder. If the backend is down at call time, Remi still knows
// who it's talking to and what they talked about last time.
export const CONTEXT_CACHE_DIR = join(TMP_DIR, 'context-cache');
const cacheFile = (elderId) => join(CONTEXT_CACHE_DIR, `${elderId.replace(/[^\w.-]/g, '_')}.json`);

export function createApi(config = readConfig()) {
  const { apiBase, apiToken, mockContext } = config;
  const auth = apiToken ? { authorization: `Bearer ${apiToken}` } : {};

  async function request(method, path, body, timeoutMs) {
    const started = Date.now();
    try {
      const res = await fetch(`${apiBase}${path}`, {
        method,
        headers: { ...auth, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      return { ok: res.ok, status: res.status, json, ms: Date.now() - started, error: res.ok ? null : (json?.error ?? text.slice(0, 200)) };
    } catch (err) {
      const error = err?.name === 'TimeoutError' ? `timed out after ${timeoutMs} ms` : (err?.cause?.code ?? err?.message ?? String(err));
      return { ok: false, status: 0, json: null, ms: Date.now() - started, error };
    }
  }

  return {
    config,
    request,

    /** CallContext, or null when the backend is slow or down (the caller is waiting). */
    async getContext(elderId, { timeoutMs = 1500 } = {}) {
      if (mockContext) return JSON.parse(await readFile(join(AGENT_DIR, 'fixtures', 'context.json'), 'utf8'));
      const r = await request('GET', `/api/agent/context?elderId=${encodeURIComponent(elderId)}`, null, timeoutMs);
      if (r.ok && r.json) {
        mkdir(CONTEXT_CACHE_DIR, { recursive: true })
          .then(() => writeFile(cacheFile(elderId), JSON.stringify({ savedAt: new Date().toISOString(), context: r.json })))
          .catch(() => {});
        return r.json;
      }
      console.warn(`[api] context for ${elderId} unavailable: ${r.status || ''} ${r.error}`);
      try {
        const { savedAt, context } = JSON.parse(await readFile(cacheFile(elderId), 'utf8'));
        console.warn(`[api] using cached context from ${savedAt}`);
        return { ...context, cached: true };
      } catch {
        return null;
      }
    },

    /** POST /api/agent/calls → callId, or null. */
    async createCall(body, { timeoutMs = 3000 } = {}) {
      if (mockContext) return { ok: true, callId: `mock-${randomUUID()}` };
      const r = await request('POST', '/api/agent/calls', body, timeoutMs);
      return { ...r, callId: r.ok ? r.json?.callId ?? null : null };
    },

    postEvent(callId, event, { timeoutMs = 3000 } = {}) {
      if (mockContext) return Promise.resolve({ ok: true, status: 204, mock: true });
      return request('POST', `/api/agent/calls/${encodeURIComponent(callId)}/events`, event, timeoutMs);
    },

    completeCall(callId, body, { timeoutMs = 5000 } = {}) {
      if (mockContext) return Promise.resolve({ ok: true, status: 202, mock: true });
      return request('POST', `/api/agent/calls/${encodeURIComponent(callId)}/complete`, body, timeoutMs);
    },

    /** Photo bytes. imageUrl is the backend's absolute URL (Bearer, per B's request) or file://. */
    async fetchPhoto(imageUrl, { timeoutMs = 3000 } = {}) {
      try {
        if (imageUrl.startsWith('file://')) {
          const raw = imageUrl.slice('file://'.length);
          const path = raw.startsWith('/') ? fileURLToPath(imageUrl) : join(AGENT_DIR, raw.replace(/^agent\//, ''));
          return await readFile(path);
        }
        const url = imageUrl.startsWith('/') ? `${apiBase}${imageUrl}` : imageUrl;
        const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(timeoutMs) });
        return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      } catch {
        return null;
      }
    },
  };
}
