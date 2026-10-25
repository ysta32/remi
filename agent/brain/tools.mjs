// Call-flow tools as plain specs: { name, description, parameters (JSON Schema), execute }.
// agent.mjs wraps each with the @livekit/agents tool helper. Verify that helper's
// exact name and signature in node_modules/@livekit/agents before wiring it up.
//
// Every execute() returns a short string immediately; HTTP is fire-and-forget.
//
// contractV2 off (the default): only tools whose events main's backend accepts, with
// the v1 safety categories. On: Kevin's full set (memory moments, safety levels).

import { CATEGORIES, LEVELS } from './safety.mjs';

const V1_CATEGORIES = ['medical_emergency', 'self_harm', 'other'];
// v1 has no level; the monitor still needs one for its guidance to the model.
const V1_LEVEL = { medical_emergency: 'emergency', self_harm: 'urgent', other: 'urgent' };

export const MEMORY_OUTCOMES = ['recalled', 'recalled_with_hint', 'answer_shared', 'skipped'];

/**
 * @param {object} o
 * @param {(event: object) => void} o.postEvent   fire-and-forget CallEvent poster
 * @param {() => number} o.elapsedMs              ms since call start
 * @param {ReturnType<import('./safety.mjs').createSafetyMonitor>} o.safety
 * @param {boolean} [o.contractV2]
 * @param {Array<{id: string, caption: string}>} [o.photos]          from CallContext
 * @param {(photo: {id: string, caption: string}) => void} [o.onShowPhoto] swaps the video
 */
export function createCallFlowTools({ postEvent, elapsedMs, safety, contractV2 = false, photos = [], onShowPhoto = () => {} }) {
  const askedMemory = new Set();
  let familyQuestionAsked = false;
  let consentRecorded = false;

  const showPhoto = {
    name: 'show_photo',
    description: 'Show one of the family photos on the video, by its id, then talk about it.',
    parameters: {
      type: 'object',
      properties: { photoId: { type: 'string', enum: photos.length ? photos.map((p) => p.id) : undefined } },
      required: ['photoId'],
      additionalProperties: false,
    },
    execute: ({ photoId }) => {
      const photo = photos.find((p) => p.id === photoId);
      if (!photo) return 'No photo with that id. Use one of the ids listed in your instructions.';
      try { onShowPhoto(photo); } catch (err) { console.error(`[tools] show_photo: ${err.message}`); }
      postEvent({ type: 'photo_shown', atMs: elapsedMs(), payload: { photoId } });
      return `Showing "${photo.caption}". Ask an open question about it.`;
    },
  };
  if (!photos.length) delete showPhoto.parameters.properties.photoId.enum;

  const reportSafetyV1 = {
    name: 'report_safety_concern',
    description: 'Call immediately, before replying, when the caller mentions a safety concern happening now (see SAFETY).',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: V1_CATEGORIES },
        note: { type: 'string', description: 'One short factual sentence.' },
      },
      required: ['category', 'note'],
      additionalProperties: false,
    },
    execute: ({ category, note }) => safety.report({ category, level: V1_LEVEL[category] ?? 'urgent', note, source: 'model' }),
  };

  const recordConsentV1 = {
    name: 'record_consent',
    description: 'Record what the caller agreed to share with family. Set every item; anything they did not agree to, or you did not ask about, is false.',
    parameters: {
      type: 'object',
      properties: {
        summaries: { type: 'boolean', description: 'Short notes about the chat for the family.' },
        funFacts: { type: 'boolean', description: 'Stories and fun facts they share.' },
        speechTrends: { type: 'boolean', description: 'Tracking how the chats go over time, like pace.' },
        mood: { type: 'boolean', description: 'Letting family know if they seem a bit down.' },
      },
      required: ['summaries', 'funFacts', 'speechTrends', 'mood'],
      additionalProperties: false,
    },
    execute: (consent) => {
      if (consentRecorded) return 'Already saved. Do not ask about sharing again.';
      consentRecorded = true;
      postEvent({ type: 'consent', atMs: elapsedMs(), payload: consent });
      return 'Saved.';
    },
  };

  const v2Tools = [
    {
      name: 'report_safety_concern',
      description: 'Call immediately, before replying, when the caller mentions a red flag (see SAFETY). Alerts family when needed.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          level: { type: 'string', enum: LEVELS },
          note: { type: 'string', description: 'One short factual sentence.' },
        },
        required: ['category', 'level', 'note'],
        additionalProperties: false,
      },
      execute: ({ category, level, note }) => safety.report({ category, level, note, source: 'model' }),
    },
    {
      name: 'record_memory_prompt',
      description: 'Call right after finishing a memory moment, with its id and how it went.',
      parameters: {
        type: 'object',
        properties: {
          promptId: { type: 'string' },
          outcome: { type: 'string', enum: MEMORY_OUTCOMES },
        },
        required: ['promptId', 'outcome'],
        additionalProperties: false,
      },
      execute: ({ promptId, outcome }) => {
        if (askedMemory.has(promptId)) return 'Already recorded. Do not ask this one again.';
        askedMemory.add(promptId);
        postEvent({ type: 'memory_prompt', atMs: elapsedMs(), payload: { promptId, outcome } });
        return 'Noted.';
      },
    },
    {
      name: 'mark_family_question_asked',
      description: 'Call right after asking the family question.',
      parameters: {
        type: 'object',
        properties: { questionId: { type: 'string' } },
        required: ['questionId'],
        additionalProperties: false,
      },
      execute: ({ questionId }) => {
        if (familyQuestionAsked) return 'Already asked. Do not ask it again.';
        familyQuestionAsked = true;
        postEvent({ type: 'question_asked', atMs: elapsedMs(), payload: { questionId } });
        return 'Noted.';
      },
    },
    {
      name: 'record_consent',
      description: 'Record what the caller agreed to share with family. Include only the items you asked about.',
      parameters: {
        type: 'object',
        properties: {
          summaries: { type: 'boolean' },
          funFacts: { type: 'boolean' },
          speechTrends: { type: 'boolean' },
          mood: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      execute: (consent) => {
        postEvent({ type: 'consent', atMs: elapsedMs(), payload: consent });
        return 'Saved.';
      },
    },
  ];
  if (contractV2) return [showPhoto, ...v2Tools];
  const keep = v2Tools.filter((t) => t.name === 'mark_family_question_asked');
  return [showPhoto, reportSafetyV1, ...keep, recordConsentV1];
}
