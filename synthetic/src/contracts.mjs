import { parseCall } from '../../detector/src/contracts.mjs';

const allowedKeys = new Set(['schemaVersion', 'seed', 'startDate', 'callsPerWeek']);
const own = (value, key, fallback) => Object.hasOwn(value, key) ? value[key] : fallback;
function invalid(field) { throw new TypeError(`Invalid synthetic configuration: ${field}.`); }

/** Resolve only user-configurable inputs; fixed generation rules cannot be overridden. */
export function resolveConfig(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) invalid('object required');
  for (const key of Reflect.ownKeys(raw)) if (!allowedKeys.has(key)) invalid('unknown key');
  const schemaVersion = own(raw, 'schemaVersion', 1);
  const seed = own(raw, 'seed', 42);
  const startDate = own(raw, 'startDate', '2026-09-28');
  const callsPerWeek = own(raw, 'callsPerWeek', 3);
  if (schemaVersion !== 1) invalid('schemaVersion');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) invalid('seed');
  if (![2, 3, 4].includes(callsPerWeek)) invalid('callsPerWeek');
  if (typeof startDate !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(startDate)) invalid('startDate');
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate || date.getUTCDay() !== 1) invalid('startDate');
  return {
    schemaVersion, seed, startDate, callsPerWeek, weeks: 4,
    timezone: 'America/New_York', localHour: 10,
    weekdays: {2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4]}[callsPerWeek],
    slotsPerCall: 5, pauseCentersMs: [600, 850, 1100, 1400], pauseJitterMs: 75,
    pausesPerCall: 8, minDurationMs: 180000, maxDurationMs: 300000,
  };
}

/** Trust the detector's actual input validation, but never forward planted metadata. */
export function toDetectorCall(canonical) {
  if (canonical === null || typeof canonical !== 'object' || canonical.isSimulated !== true) {
    throw new TypeError('Only simulated calls can be exported.');
  }
  return parseCall({
    elderId: canonical.elderId,
    callId: canonical.callId,
    startedAt: canonical.startedAt,
    isSimulated: true,
    utterances: Array.isArray(canonical.utterances) ? canonical.utterances.map((turn) => {
      if (turn === null || typeof turn !== 'object') return turn;
      return { speaker: turn.speaker, text: turn.text, startMs: turn.startMs, endMs: turn.endMs };
    }) : canonical.utterances,
  });
}

export function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
