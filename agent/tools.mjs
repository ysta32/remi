// Call-flow tools as plain specs: { name, description, parameters (JSON Schema), execute }.
// agent.mjs wraps each with the @livekit/agents tool helper. Verify that helper's
// exact name and signature in node_modules/@livekit/agents before wiring it up.
//
// Every execute() returns a short string immediately; HTTP is fire-and-forget.

import { CATEGORIES, LEVELS } from './safety.mjs';

export const MEMORY_OUTCOMES = ['recalled', 'recalled_with_hint', 'answer_shared', 'skipped'];

/**
 * @param {object} o
 * @param {(event: object) => void} o.postEvent   fire-and-forget CallEvent poster
 * @param {() => number} o.elapsedMs              ms since call start
 * @param {ReturnType<import('./safety.mjs').createSafetyMonitor>} o.safety
 */
export function createCallFlowTools({ postEvent, elapsedMs, safety }) {
  const askedMemory = new Set();
  let familyQuestionAsked = false;

  return [
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
}
