// The contract gate: every CallEvent the agent sends passes through here.
// v1 is exactly what main's backend accepts (web/lib/server/calls.ts callEventSchema);
// agent/test/contract-gate.test.mjs and web's agent-contract test keep the two in sync.

export const V1_EVENT_TYPES = ['photo_shown', 'question_asked', 'consent', 'safety'];
export const V1_SAFETY_CATEGORIES = ['self_harm', 'medical_emergency', 'other'];
export const CONSENT_KEYS = ['summaries', 'funFacts', 'speechTrends', 'mood'];

// Kevin's wider categories, folded into what v1 stores.
const V1_CATEGORY = {
  medical_emergency: 'medical_emergency',
  fall: 'medical_emergency',
  self_harm: 'self_harm',
  disorientation: 'other',
  exploitation: 'other',
  unwell: 'other',
  other: 'other',
};

const isAtMs = (v) => Number.isInteger(v) && v >= 0;
const nonEmpty = (v) => typeof v === 'string' && v.length > 0;

/** Returns null if `ev` is a valid v1 CallEvent, else a short reason. Mirrors the zod schema. */
export function v1Problem(ev) {
  if (!ev || typeof ev !== 'object') return 'not an object';
  if (!V1_EVENT_TYPES.includes(ev.type)) return `type ${ev.type} is not accepted by the backend`;
  if (!isAtMs(ev.atMs)) return 'atMs must be a non-negative integer';
  const p = ev.payload;
  if (!p || typeof p !== 'object') return 'payload missing';
  switch (ev.type) {
    case 'photo_shown': return nonEmpty(p.photoId) ? null : 'photoId missing';
    case 'question_asked': return nonEmpty(p.questionId) ? null : 'questionId missing';
    case 'consent':
      // B asked for all four keys in one event: elderConfirmed needs all four.
      return CONSENT_KEYS.every((k) => typeof p[k] === 'boolean') ? null : 'consent needs all four keys as booleans';
    case 'safety':
      if (!V1_SAFETY_CATEGORIES.includes(p.category)) return `safety category ${p.category} not accepted`;
      return typeof p.note === 'string' && p.note.length <= 2000 ? null : 'note must be text up to 2000 chars';
  }
  return 'unknown';
}

/**
 * Splits an event from the brain into what can be POSTed now (v1) and what only
 * Kevin's v2 contract would accept. Returns { send, pending }.
 */
export function gateEvent(ev, { contractV2 = false } = {}) {
  const atMs = Math.max(0, Math.round(ev?.atMs ?? 0));
  if (ev?.type === 'safety') {
    const p = ev.payload ?? {};
    const level = p.level ? ` (level: ${p.level})` : '';
    const send = {
      type: 'safety',
      atMs,
      payload: { category: V1_CATEGORY[p.category] ?? 'other', note: `${String(p.note ?? '').slice(0, 1900)}${level}`.trim() },
    };
    const extra = contractV2 && (p.level || p.category !== send.payload.category || p.source || p.notified !== undefined);
    return { send, pending: extra ? { ...ev, atMs } : null };
  }
  if (ev?.type === 'consent') {
    const payload = Object.fromEntries(CONSENT_KEYS.map((k) => [k, ev.payload?.[k] === true]));
    return { send: { type: 'consent', atMs, payload }, pending: null };
  }
  const send = { type: ev?.type, atMs, payload: ev?.payload };
  if (!v1Problem(send)) return { send, pending: null };
  return { send: null, pending: contractV2 ? { ...ev, atMs } : null };
}
