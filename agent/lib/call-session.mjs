// One call's link to the backend: create once, events through the contract gate,
// complete exactly once. Every request is fire-and-forget from the caller's point of
// view; a failure never throws into a live call. Failed requests are saved under
// agent/tmp/failed/ and `node scripts/replay-failed.mjs` (repo root) re-sends them.
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { TMP_DIR } from './config.mjs';
import { gateEvent } from './events.mjs';

export const FAILED_DIR = join(TMP_DIR, 'failed');
export const PENDING_DIR = join(TMP_DIR, 'pending-events');

/** ISO-8601 with a zone, as the backend requires. */
export const isoNow = (ms = Date.now()) => new Date(ms).toISOString();

async function save(dir, name, data) {
  try {
    await mkdir(dir, { recursive: true });
    const file = join(dir, name);
    await writeFile(file, JSON.stringify(data, null, 2));
    return file;
  } catch (err) {
    console.error(`[call] could not save ${name}: ${err.message}`);
    return null;
  }
}

/**
 * @param {object} o
 * @param {ReturnType<import('./api.mjs').createApi>} o.api
 * @param {{elderId: string, startedAt: string, language: 'en'|'zh', bridgeIdentity?: string|null, themeId?: string|null}} o.create
 * @param {boolean} [o.contractV2]
 * @param {(line: string) => void} [o.log]
 */
export function createCallSession({ api, create, contractV2 = false, log = (l) => console.log(l) }) {
  const localId = `local-${randomUUID()}`;
  const t0 = Date.parse(create.startedAt);
  const unsent = [];       // events that could not be delivered, kept for the replay bundle
  const inflight = new Set();
  let callId = null;
  let completed = null;

  const ready = api.createCall(create).then((r) => {
    if (r.callId) {
      callId = r.callId;
      log(`[call] created ${callId} (${r.ms ?? 0} ms)`);
    } else {
      log(`[call] createCall failed: ${r.status || ''} ${r.error ?? ''}. Events and transcript will be saved for replay.`);
    }
    return callId;
  });

  function track(p) {
    inflight.add(p);
    p.finally(() => inflight.delete(p));
    return p;
  }

  const elapsedMs = () => Math.max(0, Date.now() - t0);

  /** Send one brain event. Returns at once; delivery happens in the background. */
  function emit(event) {
    const ev = { ...event, atMs: event.atMs ?? elapsedMs() };
    const { send, pending } = gateEvent(ev, { contractV2 });
    if (pending) track(save(PENDING_DIR, `${Date.now()}-${pending.type}.json`, { callId, localId, event: pending }));
    if (!send) {
      log(`[call] dropped ${ev.type}: not in the backend contract${contractV2 ? ' (saved to pending-events)' : ''}`);
      return;
    }
    track(ready.then(async (id) => {
      if (!id) { unsent.push(send); return; }
      const r = await api.postEvent(id, send);
      if (r.ok) log(`[call] event ${send.type} sent (${r.ms ?? 0} ms)`);
      else {
        log(`[call] event ${send.type} failed: ${r.status || ''} ${r.error}`);
        await save(FAILED_DIR, `${id}-event-${Date.now()}.json`, { kind: 'event', callId: id, body: send, error: r.error });
      }
    }));
  }

  /** Complete once; later calls return the first result (caller disconnect and shutdown both call this). */
  function complete(body) {
    if (completed) return completed;
    completed = (async () => {
      const id = await ready;
      await Promise.allSettled([...inflight]);
      if (!id) {
        const file = await save(FAILED_DIR, `${localId}-bundle.json`, { kind: 'bundle', create, events: unsent, complete: body });
        log(`[call] no call id; whole call saved to ${file}`);
        return { ok: false, saved: file };
      }
      const r = await api.completeCall(id, body);
      if (r.ok) log(`[call] completed ${id}: ${body.utterances.length} utterances${body.audioPath ? ', with audio' : ''} (${r.ms ?? 0} ms)`);
      else {
        const file = await save(FAILED_DIR, `${id}-complete.json`, { kind: 'complete', callId: id, body, error: r.error });
        log(`[call] complete failed: ${r.status || ''} ${r.error}. Saved to ${file}`);
      }
      return r;
    })();
    return completed;
  }

  /** Live note for the family page. Fire-and-forget like emit(). */
  function note(kind, text) {
    track(ready.then(async (id) => {
      if (!id) return;
      const r = await api.postNote(id, { kind, text });
      log(r.ok ? `[call] note ${kind} sent (${r.ms ?? 0} ms)` : `[call] note ${kind} failed: ${r.status || ''} ${r.error}`);
    }));
  }

  return {
    ready,
    note,
    get callId() { return callId; },
    get localId() { return localId; },
    get completed() { return Boolean(completed); },
    elapsedMs,
    emit,
    complete,
    /** Wait for queued sends, capped. */
    async flush(timeoutMs = 4000) {
      await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, timeoutMs).unref?.())]);
    },
  };
}
