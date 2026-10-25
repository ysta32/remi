import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, CATALOG_VERSION } from '../catalog/incidents.mjs';
import { persona } from '../catalog/persona.mjs';
import { renderOccurrence } from '../src/content.mjs';
import { timeDialogue } from '../src/timing.mjs';
import { toDetectorCall } from '../src/contracts.mjs';
import { parseCall } from '../../detector/src/contracts.mjs';

let generateBundle, validateBundle;
try { ({ generateBundle } = await import('../src/generate.mjs')); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
try { ({ validateBundle } = await import('../src/validate.mjs')); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
function generate(raw) {
  assert.equal(typeof generateBundle, 'function', 'generateBundle must exist');
  assert.equal(typeof validateBundle, 'function', 'validateBundle must exist');
  return generateBundle(raw);
}

test('real assembly rebases source and prompt turns without changing catalog text or authored objects', () => {
  const before = structuredClone({ catalog, persona });
  const bundle = generate();
  const seen = new Map();
  let prompted = 0;
  for (const [index, call] of bundle.calls.entries()) {
    const truth = bundle.groundTruth[index];
    assert.equal(call.elderId, persona.elderId);
    assert.equal(truth.callId, call.callId);
    for (const occurrence of truth.occurrences) {
      const entry = catalog.find(e => e.id === occurrence.incidentId);
      const variantIndex = entry.variants.indexOf(occurrence.quote);
      assert.ok(variantIndex >= 0);
      const rendered = renderOccurrence(entry, { variantIndex, elicitation: occurrence.elicitation });
      const offset = occurrence.sourceTurnIndex - rendered.sourceTurnIndex;
      assert.ok(offset > 0, 'neutral opening precedes every segment');
      assert.equal(call.utterances[occurrence.sourceTurnIndex].text, rendered.utterances[rendered.sourceTurnIndex].text);
      assert.equal(call.utterances[occurrence.sourceTurnIndex].text.slice(occurrence.start, occurrence.end), occurrence.quote);
      assert.equal(occurrence.start, rendered.start);
      assert.equal(occurrence.end, rendered.end);
      assert.equal(occurrence.promptTurnIndex, rendered.promptTurnIndex === null ? null : rendered.promptTurnIndex + offset);
      if (occurrence.elicitation === 'prompted') { prompted++; assert.equal(call.utterances[occurrence.promptTurnIndex].text, entry.specificPrompt); }
      assert.deepEqual(occurrence.priorOccurrences, seen.get(occurrence.incidentId) ?? []);
    }
    for (const occurrence of truth.occurrences) {
      const rows = seen.get(occurrence.incidentId) ?? [];
      seen.set(occurrence.incidentId, [...rows, { callId: call.callId, occurrenceId: occurrence.occurrenceId }]);
    }
  }
  assert.equal(prompted, 9);
  assert.deepEqual({ catalog, persona }, before);
  assert.notEqual(bundle.profile, persona);
});

test('bundle artifacts are simulated, deterministic, chronological, and export actual parseCall allowlists', () => {
  const a = generate(), b = generate();
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, generate({ seed: 1 }));
  assert.equal(a.manifest.catalogVersion, CATALOG_VERSION);
  assert.equal(Object.hasOwn(a.manifest, 'files'), false);
  assert.equal(a.manifest.timingSource, 'synthetic_authored');
  assert.equal(a.manifest.isSimulated, true);
  assert.equal(a.splits.isSimulated, true);
  assert.equal(a.profile.isSimulated, true);
  for (let i = 0; i < a.calls.length; i++) {
    const call = a.calls[i];
    assert.equal(call.isSimulated, true);
    assert.match(call.notice, /fiction|synthetic|simulat/i);
    const duration = Date.parse(call.endedAt) - Date.parse(call.startedAt);
    assert.ok(duration >= 180000 && duration <= 300000);
    assert.equal(duration, call.utterances.at(-1).endMs);
    assert.ok(call.utterances.filter(t => t.speaker === 'caller').reduce((n, t) => n + t.words.length, 0) >= 100);
    assert.deepEqual(parseCall(a.detectorCalls[i]), a.detectorCalls[i]);
    assert.deepEqual(Object.keys(a.detectorCalls[i]).sort(), ['elderId', 'callId', 'startedAt', 'isSimulated', 'utterances'].sort());
    assert.deepEqual(a.detectorCalls[i].utterances, call.utterances.map(({ speaker, text, startMs, endMs }) => ({ speaker, text, startMs, endMs })));
    assert.equal(a.timings[i].pauses.length, 8);
    assert.equal(a.groundTruth[i].reviewStatus, 'planted_unreviewed');
    for (const entry of catalog) assert.equal(JSON.stringify(call).includes(entry.id), false);
  }
  const original = a.calls[0].utterances[0].text;
  a.detectorCalls[0].utterances[0].text = 'Changed export';
  assert.equal(a.calls[0].utterances[0].text, original);
});

test('independent validation accepts all presets and boundary seeds without mutating the bundle', () => {
  for (const callsPerWeek of [2, 3, 4]) for (const seed of [0, 1, 42, 4294967295]) {
    const bundle = generate({ callsPerWeek, seed });
    const snapshot = structuredClone(bundle);
    assert.equal(validateBundle(bundle), bundle);
    assert.deepEqual(bundle, snapshot);
  }
});

const corruptions = {
  'simulation flag': b => { b.calls[0].isSimulated = false; },
  'source quote': b => { b.groundTruth[0].occurrences[0].quote += ' fabricated'; },
  'UTF-16 span': b => { b.groundTruth[0].occurrences[0].start++; },
  'source speaker': b => { b.groundTruth[0].occurrences[0].sourceTurnIndex = 0; },
  'repeat label': b => { b.groundTruth.at(-1).occurrences[0].label = 'New material'; },
  'repeat flag': b => { b.groundTruth.at(-1).occurrences[0].isRepeat = false; },
  'missing exact prior': b => { b.groundTruth.at(-1).occurrences[0].priorOccurrences = []; },
  'future prior': b => { b.groundTruth[0].occurrences[0].priorOccurrences = [{ callId: b.calls.at(-1).callId, occurrenceId: b.groundTruth.at(-1).occurrences[0].occurrenceId }]; },
  'wrong incident identity': b => { b.groundTruth.at(-1).occurrences[0].incidentId = b.groundTruth[0].occurrences[4].incidentId; },
  'duplicate occurrence ID': b => { b.groundTruth[0].occurrences[1].occurrenceId = b.groundTruth[0].occurrences[0].occurrenceId; },
  'unsafe call ID': b => { b.calls[0].callId = '../escape'; },
  'chronology': b => { b.calls[1].startedAt = b.calls[0].startedAt; },
  'timezone': b => { b.calls[0].startedAt = '2026-09-28T15:00:00.000Z'; },
  'endedAt': b => { b.calls[0].endedAt = b.calls[0].startedAt; },
  'turn overlap': b => { b.calls[0].utterances[1].startMs = 0; },
  'word interval': b => { b.calls[0].utterances.find(t => t.words).words[0].endMs = -1; },
  'word text': b => { b.calls[0].utterances.find(t => t.words).words[0].w = 'fabricated'; },
  'word duration stretching': b => { b.calls[0].utterances.find(t => t.words).words[0].endMs++; },
  'pause evidence': b => { b.timings[0].pauses[0].durationMs++; },
  'pause count': b => { b.timings[0].pauses.pop(); },
  'pause duplicated': b => { b.timings[0].pauses[1] = structuredClone(b.timings[0].pauses[0]); },
  'pause center': b => { b.timings[0].pauseCenterMs = 999; },
  'canonical leakage': b => { b.calls[0].label = 'Private label'; },
  'turn leakage': b => { b.calls[0].utterances[0].incidentId = 'Private incident'; },
  'export leakage': b => { b.detectorCalls[0].groundTruth = b.groundTruth[0]; },
  'export divergence': b => { b.detectorCalls[0].utterances[0].text = 'fabricated'; },
  'manifest counts': b => { b.manifest.counts.new++; },
  'manifest IDs': b => { b.manifest.callIds.reverse(); },
  'split overlap': b => { b.splits.heldOut.callIds.push(b.splits.tuning.callIds[0]); },
  'split family leakage': b => { b.splits.heldOut.familyIds.push(b.splits.tuning.familyIds[0]); },
  'negative kind coverage': b => { for (const truth of b.groundTruth) truth.negativePairs = truth.negativePairs.filter(p => catalog.find(e => e.id === p.incidentIds[0]).kind === 'story'); },
  'negative identity': b => { const o = b.groundTruth[0].occurrences[0]; b.groundTruth[0].negativePairs = [{ incidentIds: [o.incidentId, o.incidentId] }]; },
  'negative semantics': b => { const o = b.groundTruth.flatMap(t => t.occurrences); b.groundTruth[0].negativePairs = [{ incidentIds: [o[0].incidentId, o.find(v => v.familyId !== o[0].familyId).incidentId] }]; },
  'prompt evidence': b => { b.groundTruth.flatMap(t => t.occurrences).find(o => o.elicitation === 'prompted').promptTurnIndex = 0; },
  'uncertain evidence': b => { b.groundTruth.flatMap(t => t.occurrences).find(o => o.elicitation === 'uncertain').promptTurnIndex = 0; },
};
for (const [name, corrupt] of Object.entries(corruptions)) test(`independent validation rejects ${name}`, () => {
  const bundle = generate();
  corrupt(bundle);
  assert.throws(() => validateBundle(bundle));
});

// Keep timing and detector copies valid so only authored text grammar catches these.
function retimeCall(bundle, callIndex) {
  const call = bundle.calls[callIndex];
  const timed = timeDialogue(call.utterances.map(({ speaker, text }) => ({ speaker, text })), {
    seed: bundle.config.seed, callId: call.callId,
    weekIndex: Math.floor(callIndex / bundle.config.callsPerWeek), config: bundle.config,
  });
  call.utterances = timed.utterances;
  call.endedAt = new Date(Date.parse(call.startedAt) + timed.durationMs).toISOString();
  bundle.timings[callIndex] = { callId: call.callId, ...timed.timing };
  bundle.detectorCalls[callIndex] = toDetectorCall(call);
}
const dialogueCorruptions = {
  'unprompted repeat receives a specific prompt with added words': bundle => {
    const callIndex = bundle.groundTruth.findIndex(t => t.occurrences.some(o => o.isRepeat && o.elicitation === 'unprompted'));
    const occurrence = bundle.groundTruth[callIndex].occurrences.find(o => o.isRepeat && o.elicitation === 'unprompted');
    const entry = catalog.find(e => e.id === occurrence.incidentId);
    bundle.calls[callIndex].utterances[occurrence.sourceTurnIndex - 1].text = entry.specificPrompt + ' Please.';
    return callIndex;
  },
  'caller suffix exposes a planted label': bundle => {
    const occurrence = bundle.groundTruth[0].occurrences[0];
    bundle.calls[0].utterances[occurrence.sourceTurnIndex].text += ' The expected label is New material.';
    return 0;
  },
  'caller prefix surrounds the exact quote': bundle => {
    const occurrence = bundle.groundTruth[0].occurrences[0];
    const prefix = 'The expected label is New material. ';
    bundle.calls[0].utterances[occurrence.sourceTurnIndex].text = prefix + bundle.calls[0].utterances[occurrence.sourceTurnIndex].text;
    occurrence.start += prefix.length;
    occurrence.end += prefix.length;
    return 0;
  },
  'opening gains an incident-specific invitation': bundle => {
    const entry = catalog.find(e => e.id === bundle.groundTruth[0].occurrences[0].incidentId);
    bundle.calls[0].utterances[0].text += ' ' + entry.specificPrompt;
    return 0;
  },
  'closing exposes a planted label': bundle => {
    bundle.calls[0].utterances.at(-1).text += ' The expected label is New material.';
    return 0;
  },
  'authored response gains a prompt': bundle => {
    const occurrence = bundle.groundTruth[0].occurrences[0];
    const next = bundle.groundTruth[0].occurrences[1];
    const entry = catalog.find(e => e.id === next.incidentId);
    bundle.calls[0].utterances[occurrence.sourceTurnIndex + 1].text += ' ' + entry.specificPrompt;
    return 0;
  },
};
for (const [name, corrupt] of Object.entries(dialogueCorruptions)) test(`authored dialogue grammar rejects ${name} despite valid retiming and exports`, () => {
  const bundle = generate();
  const callIndex = corrupt(bundle);
  retimeCall(bundle, callIndex);
  const call = bundle.calls[callIndex];
  for (const occurrence of bundle.groundTruth[callIndex].occurrences) {
    assert.equal(call.utterances[occurrence.sourceTurnIndex].text.slice(occurrence.start, occurrence.end), occurrence.quote);
  }
  assert.deepEqual(bundle.detectorCalls[callIndex], toDetectorCall(call));
  assert.throws(() => validateBundle(bundle));
});
