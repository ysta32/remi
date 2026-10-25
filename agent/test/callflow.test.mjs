import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInstructions, openingInstructions, pickMemoryPrompts } from '../brain/callflow.mjs';
import { resolveSafetyConfig } from '../brain/safety.mjs';
import { createCallFlowTools } from '../brain/tools.mjs';

const base = JSON.parse(readFileSync(new URL('../fixtures/context.v2.json', import.meta.url), 'utf8'));
const now = new Date('2026-10-24T20:00:00Z');
const render = (ctx) => buildInstructions(ctx, { safety: resolveSafetyConfig(ctx, {}), now, contractV2: true });

test('opening greets by name, recalls last call, asks about the day', () => {
  const text = openingInstructions(base);
  assert.match(text, /Greet Hal/);
  assert.match(text, /1978 blizzard/);
  assert.match(text, /how their day has been/);
});

test('returning call covers check-in, memory moments, family question, safety', () => {
  const text = render(base);
  assert.match(text, /What did you get up to today\?/);
  assert.match(text, /m-honeymoon/);
  assert.match(text, /m-beagle/);
  assert.doesNotMatch(text, /m-porch/, 'only two memory prompts per call by default');
  assert.match(text, /Sam was wondering/);
  assert.match(text, /report_safety_concern BEFORE you reply/);
  assert.match(text, /letting Linda know/);
  assert.doesNotMatch(text, /SHARING/);
  assert.match(text, /Last call \(2 days ago\)/);
});

test('first call asks for sharing and discloses emergency alerts', () => {
  const text = render({ ...base, lastCall: null, consent: { ...base.consent, elderConfirmed: false } });
  assert.match(text, /SHARING \(first time only\)/);
  assert.match(text, /I'll let Linda know right away/);
  assert.match(text, /first call together/);
});

test('demo mode uses one memory prompt and a 2-step wrap', () => {
  const text = render({ ...base, demoMode: true });
  assert.match(text, /m-honeymoon/);
  assert.doesNotMatch(text, /m-beagle/);
  assert.match(text, /One follow-up, then wrap up warmly/);
});

test('without a contact phone, Remi never claims to alert anyone', () => {
  const text = render({ ...base, emergency: null });
  assert.match(text, /no family contact is set up/);
  assert.doesNotMatch(text, /letting Linda know/);
});

test('no memory prompts: section omitted', () => {
  const text = render({ ...base, memoryPrompts: [] });
  assert.doesNotMatch(text, /MEMORY MOMENTS/);
});

test('pickMemoryPrompts skips prompts without an answer', () => {
  const picked = pickMemoryPrompts({ memoryPrompts: [{ id: 'a', question: 'Q?' }, { id: 'b', question: 'Q?', answer: 'A' }] }, 2);
  assert.deepEqual(picked.map((p) => p.id), ['b']);
});

test('handles open-ended questions and keeps the mind active', () => {
  const text = render(base);
  assert.match(text, /ANSWERING ANYTHING/);
  assert.match(text, /can't look anything up/);
  assert.match(text, /as if for the first time/);
  assert.match(text, /KEEPING THE MIND ACTIVE/);
  assert.match(text, /never a test/);
});

test('knows today in the elder timezone', () => {
  // 20:00Z on Oct 24 2026 is 4:00 PM in New York (EDT).
  assert.match(render(base), /TODAY: Saturday, October 24, 2026 at 4:00 PM where Hal is/);
});

test('prompt stays reasonably short for latency', () => {
  const words = render(base).split(/\s+/).length;
  // scripts/model-latency.mjs: an 18-word prompt answered no faster than the full one.
  assert.ok(words < 1900, `${words} words`);
});

test('tools post events once and route safety through the monitor', () => {
  const events = [];
  const reports = [];
  const tools = Object.fromEntries(createCallFlowTools({
    postEvent: (e) => events.push(e),
    elapsedMs: () => 5000,
    safety: { report: (r) => { reports.push(r); return 'ok'; } },
    contractV2: true,
  }).map((t) => [t.name, t]));

  assert.equal(tools.record_memory_prompt.execute({ promptId: 'm-beagle', outcome: 'recalled_with_hint' }), 'Noted.');
  assert.match(tools.record_memory_prompt.execute({ promptId: 'm-beagle', outcome: 'recalled' }), /Already recorded/);
  tools.mark_family_question_asked.execute({ questionId: 'q-car' });
  assert.match(tools.mark_family_question_asked.execute({ questionId: 'q-car' }), /Already asked/);
  tools.report_safety_concern.execute({ category: 'fall', level: 'urgent', note: 'Fell today.' });

  assert.deepEqual(events.map((e) => e.type), ['memory_prompt', 'question_asked']);
  assert.equal(events[0].atMs, 5000);
  assert.deepEqual(reports, [{ category: 'fall', level: 'urgent', note: 'Fell today.', source: 'model' }]);
});

test('any caller: Remi adapts and never shares the elder\'s details with someone else', async () => {
  const { buildInstructions: full } = await import('../brain/index.mjs');
  const text = full(base, { now, env: {} });
  assert.match(text, /IF THE CALLER IS NOT HAL/);
  assert.match(text, /Never share anything about Hal/);
});

test('style: adds material instead of parroting, asks fewer and deeper questions', () => {
  const text = render(base);
  assert.match(text, /Never parrot/);
  assert.match(text, /fun fact/);
  assert.match(text, /Most turns end with a statement/);
  assert.match(text, /PERSONALITY/);
  assert.match(text, /Never use canned therapist lines/);
  assert.doesNotMatch(text, /What did the shop floor smell like/);
});

test('outbound opening: Remi says she is calling', () => {
  assert.match(openingInstructions(base, { outbound: true }), /it's Remi calling/);
  assert.doesNotMatch(openingInstructions(base), /calling/);
});
