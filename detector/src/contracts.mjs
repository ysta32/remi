import { createHash } from 'node:crypto';
import { DetectorError } from './errors.mjs';

function fail(code) {
  throw new DetectorError(code, code === 'INVALID_HISTORY' ? 'Invalid saved item history.' : 'Invalid call input.');
}
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = (value, max = Infinity) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const index = (value) => Number.isInteger(value) && value >= 0;
function id(value, code) {
  if (!nonblank(value, 200)) fail(code);
  return value;
}
function datetime(value, code) {
  if (typeof value !== 'string') fail(code);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) fail(code);
  const [, year, month, day, hour, minute, second = '0', , zone] = parts;
  const y = Number(year);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (+month < 1 || +month > 12 || +day < 1 || +day > days[+month - 1] || +hour > 23 || +minute > 59 || +second > 59) fail(code);
  if (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) fail(code);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(code);
  return new Date(time).toISOString();
}

/** Validate and copy a transcript, preserving only the public call fields. */
export function parseCall(value) {
  const code = 'INVALID_INPUT';
  if (!object(value)) fail(code);
  const elderId = id(value.elderId, code);
  const callId = id(value.callId, code);
  const startedAt = datetime(value.startedAt, code);
  const isSimulated = value.isSimulated === undefined ? false : value.isSimulated;
  if (typeof isSimulated !== 'boolean' || !Array.isArray(value.utterances) || value.utterances.length > 1000) fail(code);
  let total = 0;
  const utterances = [];
  for (const turn of value.utterances) {
    if (!object(turn) || !['caller', 'agent'].includes(turn.speaker) || typeof turn.text !== 'string' || turn.text.length > 20000) fail(code);
    total += turn.text.length;
    if (total > 120000) fail(code);
    const parsed = { speaker: turn.speaker, text: turn.text };
    if (Object.hasOwn(turn, 'startMs') || Object.hasOwn(turn, 'endMs')) {
      if (!index(turn.startMs) || !index(turn.endMs) || turn.endMs < turn.startMs) fail(code);
      parsed.startMs = turn.startMs;
      parsed.endMs = turn.endMs;
    }
    utterances.push(parsed);
  }
  return { elderId, callId, startedAt, isSimulated, utterances };
}

/** Validate saved evidence structurally; previous transcripts are unavailable. */
export function parseHistory(value) {
  const code = 'INVALID_HISTORY';
  if (!Array.isArray(value) || value.length > 100000) fail(code);
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (!object(entry)) fail(code);
    const parsed = {
      id: id(entry.id, code),
      elderId: id(entry.elderId, code),
      callId: id(entry.callId, code),
      startedAt: datetime(entry.startedAt, code),
      isSimulated: entry.isSimulated,
      kind: entry.kind,
      summary: entry.summary,
      quote: entry.quote,
      sourceTurnIndex: entry.sourceTurnIndex,
      elicitation: entry.elicitation,
      promptTurnIndex: entry.promptTurnIndex,
    };
    if (seen.has(parsed.id)) fail(code);
    seen.add(parsed.id);
    if (typeof parsed.isSimulated !== 'boolean' || !['story', 'question'].includes(parsed.kind) || !nonblank(parsed.summary, 280) || !nonblank(parsed.quote, 1200) || !index(parsed.sourceTurnIndex) || !['unprompted', 'prompted', 'uncertain'].includes(parsed.elicitation)) fail(code);
    if (parsed.elicitation === 'prompted') {
      if (!index(parsed.promptTurnIndex) || parsed.promptTurnIndex >= parsed.sourceTurnIndex) fail(code);
    } else if (parsed.promptTurnIndex !== null) fail(code);
    if (entry.embedding !== undefined && entry.embedding !== null) {
      if (!Array.isArray(entry.embedding) || !Number.isInteger(entry.embeddingDimensions) || entry.embeddingDimensions <= 0 || entry.embedding.length !== entry.embeddingDimensions || !nonblank(entry.embeddingModel)) fail(code);
      let nonzero = false;
      const vector = [];
      for (const component of entry.embedding) {
        if (typeof component !== 'number' || !Number.isFinite(component)) fail(code);
        if (component !== 0) nonzero = true;
        vector.push(component);
      }
      if (!nonzero) fail(code);
      parsed.embedding = vector;
    } else {
      if (entry.embeddingModel != null || entry.embeddingDimensions != null) fail(code);
      if (Object.hasOwn(entry, 'embedding')) parsed.embedding = entry.embedding;
    }
    for (const field of ['embeddingModel', 'embeddingDimensions']) if (Object.hasOwn(entry, field)) parsed[field] = entry[field];
    for (const field of ['extractionModel', 'promptVersion']) {
      if (entry[field] !== undefined) {
        if (!nonblank(entry[field])) fail(code);
        parsed[field] = entry[field];
      }
    }
    result.push(parsed);
  }
  return result;
}

/** Hash an unambiguous source tuple, never display text such as the summary. */
export function makeItemId({ elderId, callId, kind, sourceTurnIndex, quote }) {
  const source = JSON.stringify([elderId, callId, kind, sourceTurnIndex, quote]);
  return `item_${createHash('sha256').update(source).digest('hex')}`;
}
