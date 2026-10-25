// Red-flag handling for a live call.
//
// Two ways a concern is raised:
//   1. The model calls the report_safety_concern tool (primary).
//   2. screenCallerText() matches high-precision first-person phrases in the
//      caller's live transcript (backstop, in case the model misses one).
//
// Both go through report(), which logs a `safety` call event and, depending on
// level and SAFETY_MODE, texts the emergency contact over iMessage and/or posts
// to an emergency dispatch webhook. Everything is fire-and-forget: the model
// never waits on the network.

import { sendIMessage, dispatchEmergency, maskPhone } from './notify.mjs';

export const CATEGORIES = ['medical_emergency', 'fall', 'self_harm', 'disorientation', 'exploitation', 'other'];
export const LEVELS = ['watch', 'urgent', 'emergency']; // ascending severity

const LABELS = {
  medical_emergency: 'a possible medical emergency',
  fall: 'a fall',
  self_harm: 'talk of not wanting to live or of self-harm',
  disorientation: 'not knowing where they are',
  exploitation: 'someone asking for money or personal details',
  other: 'something worrying',
};

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Merge the elder's emergency settings from context with env overrides.
 * Env wins so the operator can point alerts at a teammate's phone for a demo.
 */
export function resolveSafetyConfig(ctx, env = process.env) {
  const fromCtx = ctx?.emergency ?? {};
  const contactPhone = (env.EMERGENCY_CONTACT_PHONE || fromCtx.contactPhone || '').trim();
  const mode = (env.SAFETY_MODE || fromCtx.mode || 'family').trim();
  return {
    mode: mode === '911' ? '911' : 'family',
    contactName: env.EMERGENCY_CONTACT_NAME || fromCtx.contactName || ctx?.family?.primaryContactName || null,
    contactPhone: E164.test(contactPhone) ? contactPhone : null,
    address: env.ELDER_ADDRESS || fromCtx.address || null,
    notifyMinLevel: LEVELS.includes(env.SAFETY_NOTIFY_MIN_LEVEL) ? env.SAFETY_NOTIFY_MIN_LEVEL : 'urgent',
    dispatchUrl: env.EMERGENCY_DISPATCH_URL || null,
    dispatchToken: env.EMERGENCY_DISPATCH_TOKEN || null,
  };
}

// --- keyword backstop ---------------------------------------------------------
// First-person, present-tense phrases only: reminiscence calls are full of past
// stories ("Dad had chest pains in '79") that must not page the family.

const RULES = [
  { category: 'medical_emergency', level: 'emergency', re: /\bi (?:can'?t|cannot|can not) breathe\b/ },
  { category: 'medical_emergency', level: 'emergency', re: /\b(?:i'?m|i am) having (?:a )?(?:hard time|trouble) breathing\b/ },
  { category: 'medical_emergency', level: 'emergency', re: /\bmy chest (?:hurts|is hurting|is tight|feels tight|feels heavy)\b/ },
  { category: 'medical_emergency', level: 'emergency', re: /\b(?:i'?m|i am) having (?:a )?(?:heart attack|stroke|chest pains?)\b/ },
  { category: 'medical_emergency', level: 'emergency', re: /\b(?:please|can you|you need to|somebody|someone) call (?:an ambulance|911)\b/ },
  { category: 'fall', level: 'emergency', re: /\bi (?:can'?t|cannot|can not) get up\b/ },
  { category: 'fall', level: 'urgent', re: /\bi(?: just| have|'ve)? (?:fell|fallen)\b(?! (?:in love|asleep|for|behind|apart))/ },
  { category: 'fall', level: 'urgent', re: /\bi had a fall\b/ },
  { category: 'self_harm', level: 'emergency', re: /\b(?:kill|hurt) myself\b/ },
  { category: 'self_harm', level: 'emergency', re: /\bend my (?:own )?life\b/ },
  { category: 'self_harm', level: 'urgent', re: /\bi (?:just )?want to die\b/ },
  { category: 'self_harm', level: 'urgent', re: /\bi (?:don'?t|do not) want to (?:live|be here) anymore\b/ },
  { category: 'self_harm', level: 'urgent', re: /\b(?:i'?d|i would) be better off dead\b/ },
  { category: 'disorientation', level: 'urgent', re: /\bi (?:don'?t|do not) know where i am\b/ },
  { category: 'disorientation', level: 'urgent', re: /\bi (?:can'?t|cannot) find my way (?:home|back)\b/ },
  { category: 'exploitation', level: 'urgent', re: /\b(?:buy|send|pay with)\b(?: \w+){0,4} gift cards?\b/ },
  { category: 'exploitation', level: 'urgent', re: /\b(?:wire|send) (?:them|him|her|somebody|someone) (?:some )?money\b/ },
];

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ');
}

/** Returns every rule hit in one caller utterance (possibly empty). */
export function screenText(text) {
  const t = normalize(text);
  const hits = [];
  for (const { category, level, re } of RULES) {
    const m = t.match(re);
    if (m) hits.push({ category, level, match: m[0] });
  }
  return hits;
}

// --- message copy -------------------------------------------------------------

function clockTime(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
  }
}

export function familyAlertText({ name, category, level, note, mode, address, at, timeZone }) {
  const when = clockTime(at, timeZone);
  const what = LABELS[category] ?? LABELS.other;
  const detail = note ? ` Remi's note: "${note.slice(0, 200)}"` : '';
  if (level === 'emergency') {
    const ask = mode === '911'
      ? `Please call 911 for ${name} now${address ? ` (address on file: ${address})` : ''}, then call ${name}.`
      : `Please call ${name} right away. If you can't reach them, call 911${address ? ` (address on file: ${address})` : ''}.`;
    return `URGENT from Remi: on ${name}'s call at ${when}, something came up that may be an emergency: ${what}.${detail} Remi told ${name} to call 911. ${ask}`;
  }
  return `Remi check-in alert: on ${name}'s call at ${when}, something came up that needs attention: ${what}.${detail} Please check on ${name} today.`;
}

// --- monitor ------------------------------------------------------------------

/**
 * One monitor per call.
 * @param {object} o
 * @param {object} o.ctx            CallContext (plus optional `emergency`)
 * @param {string|null} o.callId
 * @param {(event: object) => void} [o.postEvent]  fire-and-forget CallEvent poster
 * @param {() => number} [o.elapsedMs]              ms since call start, for event atMs
 * @param {object} [o.env]
 * @param {object} [o.deps]  { sendIMessage, dispatchEmergency, now } for tests
 */
export function createSafetyMonitor({ ctx, callId, postEvent = () => {}, elapsedMs = () => 0, env = process.env, deps = {}, contractV2 = true }) {
  // Family alerts need Kevin's extended contract (emergency contact). Off: log the
  // concern as a v1 safety event and never text or dispatch anyone.
  const cfg = contractV2 ? resolveSafetyConfig(ctx, env) : { ...resolveSafetyConfig(ctx, env), contactPhone: null, dispatchUrl: null };
  const send = deps.sendIMessage ?? sendIMessage;
  const dispatch = deps.dispatchEmergency ?? dispatchEmergency;
  const now = deps.now ?? (() => new Date());
  const name = ctx?.elder?.preferredName ?? 'your family member';
  const timeZone = ctx?.elder?.timezone;
  const notifiedLevel = new Map(); // category -> highest level already escalated
  const texted = new Set();        // categories the contact was actually texted about
  const pending = new Set();
  let concernCount = 0;

  if (contractV2 && !cfg.contactPhone) {
    console.warn('[safety] no valid emergency contact phone (E.164); concerns will be logged but nobody will be texted');
  }

  function rank(level) { return LEVELS.indexOf(level); }

  function report({ category, level, note = '', source = 'model' }) {
    if (!CATEGORIES.includes(category)) category = 'other';
    if (!LEVELS.includes(level)) level = 'urgent';
    note = String(note).trim().slice(0, 300);
    concernCount += 1;

    const prior = notifiedLevel.get(category);
    const shouldNotify = rank(level) >= rank(cfg.notifyMinLevel)
      && (prior === undefined || rank(level) > rank(prior));
    if (shouldNotify) notifiedLevel.set(category, level);
    const willText = shouldNotify && Boolean(cfg.contactPhone);
    const willDispatch = shouldNotify && level === 'emergency' && cfg.mode === '911' && Boolean(cfg.dispatchUrl);

    console.warn(`[safety] ${level} ${category} (source=${source}) text=${willText ? maskPhone(cfg.contactPhone) : 'no'} dispatch=${willDispatch ? 'yes' : 'no'}`);
    postEvent({
      type: 'safety',
      atMs: elapsedMs(),
      payload: { category, level, note, source, notified: willText, dispatched: willDispatch },
    });

    if (willText) {
      texted.add(category);
      const body = familyAlertText({ name, category, level, note, mode: cfg.mode, address: cfg.address, at: now(), timeZone });
      // Same key on retry so the service can de-duplicate; distinct per category+level.
      const key = `remi-${callId ?? 'nocall'}-${category}-${level}`;
      track(send({ phone: cfg.contactPhone, body, idempotencyKey: key }).then((r) => {
        if (!r.ok) console.error(`[safety] family alert NOT confirmed (key ${key}): ${r.detail}`);
      }));
    }
    if (willDispatch) {
      track(dispatch({
        url: cfg.dispatchUrl,
        token: cfg.dispatchToken,
        payload: {
          elderName: ctx?.elder?.displayName ?? name,
          address: cfg.address,
          category,
          note,
          callId,
          contact: { name: cfg.contactName, phone: cfg.contactPhone },
          at: now().toISOString(),
        },
      }).then((r) => {
        if (!r.ok) console.error(`[safety] emergency dispatch failed: ${r.detail}`);
      }));
    }

    return guidanceFor({ level, category, notified: texted.has(category) });
  }

  // What the tool hands back to the model, so its next sentence matches reality.
  function guidanceFor({ level, category, notified }) {
    const who = cfg.contactName ?? 'the family';
    const told = notified
      ? `${who} has been sent an alert; you may tell ${name} you're letting ${who} know.`
      : `No family alert could be sent; do not say that you told anyone.`;
    if (level === 'emergency') {
      return `${told} Tell ${name} calmly and clearly to hang up and call 911 right now. Never say you called 911 or that help is on the way.`
        + (category === 'self_harm' ? ' Also give 988, the Suicide and Crisis Lifeline (call or text).' : '');
    }
    if (category === 'self_harm') {
      return `${told} Slow down, respond with care, give 988 (call or text) and 911 if in danger right now. Do not return to the call agenda.`;
    }
    if (level === 'urgent') return `${told} Stay calm and kind, and ask a gentle follow-up about how ${name} is doing right now.`;
    return 'Noted. Continue gently.';
  }

  function track(p) {
    const settled = p
      .catch((err) => console.error(`[safety] alert error: ${err?.message ?? err}`))
      .finally(() => pending.delete(settled));
    pending.add(settled);
  }

  /** Feed each final caller transcript line here. */
  function screenCallerText(text) {
    for (const hit of screenText(text)) {
      report({ category: hit.category, level: hit.level, note: `Caller said: "${hit.match}"`, source: 'keyword' });
    }
  }

  /** Await in-flight alerts (call from the shutdown callback, with a cap). */
  async function flush(timeoutMs = 8000) {
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise((r) => setTimeout(r, timeoutMs).unref?.()),
    ]);
  }

  return { config: cfg, report, screenCallerText, flush, get concernCount() { return concernCount; } };
}
