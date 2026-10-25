import assert from 'node:assert/strict';
import { catalog, CATALOG_VERSION } from '../catalog/incidents.mjs';
import { persona } from '../catalog/persona.mjs';
import { resolveConfig, toDetectorCall } from './contracts.mjs';
import { stableId } from './random.mjs';
import { OPENING_TEXT, CLOSING_TEXT } from './framing.mjs';

const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = values => [...values].sort(lexical);
const labels = { unprompted: 'Unprompted repeat', prompted: 'Prompted retelling', uncertain: 'Uncertain' };
const CALLER_LEAD_IN = 'Let me think. ';
const integer = n => Number.isInteger(n) && n >= 0;
const keys = (object, expected) => assert.deepEqual(Reflect.ownKeys(object).sort(lexical), sorted(expected), 'Unexpected artifact fields.');
const tokens = text => text.match(/\S+/gu) ?? [];
const localTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const byId = new Map(catalog.map(entry => [entry.id, entry]));

function validateTiming(call, timing, config, weekIndex) {
  keys(timing, ['callId', 'isSimulated', 'timingSource', 'notice', 'weekIndex', 'pauseCenterMs', 'pauses', 'ordinaryGapMs', 'turnGapMs', 'wordDurationRule']);
  assert.equal(timing.isSimulated, true);
  assert.equal(timing.timingSource, 'synthetic_authored');
  assert.match(timing.notice, /authored/i);
  assert.match(timing.notice, /no audio.*measur|no.*measured.*audio/i);
  assert.equal(timing.weekIndex, weekIndex);
  assert.equal(timing.pauseCenterMs, config.pauseCentersMs[weekIndex]);
  assert.equal(timing.ordinaryGapMs, 40);
  assert.equal(timing.turnGapMs, 250);
  assert.match(timing.wordDurationRule, /420 ms/);
  assert.equal(timing.pauses.length, 8);
  const pauses = new Map();
  for (const pause of timing.pauses) {
    keys(pause, ['turnIndex', 'afterWordIndex', 'startMs', 'endMs', 'durationMs', 'kind']);
    assert.ok(integer(pause.turnIndex) && integer(pause.afterWordIndex));
    const turn = call.utterances[pause.turnIndex];
    assert.equal(turn?.speaker, 'caller');
    const before = turn.words[pause.afterWordIndex], after = turn.words[pause.afterWordIndex + 1];
    assert.ok(before && after, 'Planted pause must be internal to a caller turn.');
    assert.equal(pause.kind, 'planted');
    assert.ok(integer(pause.startMs) && integer(pause.endMs) && integer(pause.durationMs));
    assert.equal(pause.startMs, before.endMs);
    assert.equal(pause.endMs, after.startMs);
    assert.equal(pause.durationMs, pause.endMs - pause.startMs);
    assert.ok(Math.abs(pause.durationMs - timing.pauseCenterMs) <= 75);
    const key = `${pause.turnIndex}:${pause.afterWordIndex}`;
    assert.ok(!pauses.has(key), 'Duplicate planted pause.');
    pauses.set(key, pause);
  }
  let cursor = 0, callerWords = 0;
  for (const [turnIndex, turn] of call.utterances.entries()) {
    assert.ok(['caller', 'agent'].includes(turn.speaker));
    keys(turn, turn.speaker === 'caller' ? ['speaker', 'text', 'startMs', 'endMs', 'words'] : ['speaker', 'text', 'startMs', 'endMs']);
    assert.equal(typeof turn.text, 'string');
    const words = tokens(turn.text);
    assert.ok(words.length > 0);
    assert.ok(integer(turn.startMs) && integer(turn.endMs) && turn.endMs > turn.startMs);
    if (turnIndex) cursor += 250;
    assert.equal(turn.startMs, cursor, 'Turn gaps must follow the authored rule.');
    if (turn.speaker === 'caller') {
      assert.equal(turn.words.length, words.length);
      callerWords += words.length;
    }
    for (const [wordIndex, text] of words.entries()) {
      if (turn.speaker === 'caller') {
        const word = turn.words[wordIndex];
        keys(word, ['w', 'startMs', 'endMs']);
        assert.equal(word.w, text);
        assert.equal(word.startMs, cursor);
        assert.equal(word.endMs, cursor + 420, 'Words use fixed authored durations.');
      }
      cursor += 420;
      if (wordIndex < words.length - 1) cursor += pauses.get(`${turnIndex}:${wordIndex}`)?.durationMs ?? 40;
    }
    assert.equal(turn.endMs, cursor, 'No stretching or silent padding.');
  }
  assert.ok(callerWords >= 100);
  assert.ok(cursor >= 180000 && cursor <= 300000);
  assert.equal(call.endedAt, new Date(Date.parse(call.startedAt) + cursor).toISOString());
}

/** Independently recompute corpus invariants; producer counts are never proof. */
export function validateBundle(bundle) {
  assert.ok(bundle && typeof bundle === 'object');
  keys(bundle, ['config', 'profile', 'calls', 'detectorCalls', 'groundTruth', 'timings', 'splits', 'manifest']);
  const raw = Object.fromEntries(['schemaVersion', 'seed', 'startDate', 'callsPerWeek'].map(key => [key, bundle.config[key]]));
  const config = resolveConfig(raw);
  assert.deepEqual(bundle.config, config);
  assert.deepEqual(bundle.profile, persona);
  const expectedCounts = {
    2: { new: 20, unprompted: 12, prompted: 6, uncertain: 2 },
    3: { new: 30, unprompted: 18, prompted: 9, uncertain: 3 },
    4: { new: 40, unprompted: 24, prompted: 12, uncertain: 4 },
  }[config.callsPerWeek];
  const count = config.callsPerWeek * 4;
  for (const rows of [bundle.calls, bundle.detectorCalls, bundle.groundTruth, bundle.timings]) {
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, count);
  }
  const callIds = bundle.calls.map(call => call.callId);
  assert.equal(new Set(callIds).size, count);
  for (const rows of [bundle.detectorCalls, bundle.groundTruth, bundle.timings]) assert.deepEqual(rows.map(row => row.callId), callIds);
  keys(bundle.splits, ['isSimulated', 'tuning', 'heldOut']);
  assert.equal(bundle.splits.isSimulated, true);
  const splitOfCall = new Map(), splitOfFamily = new Map();
  const evidence = {};
  for (const name of ['tuning', 'heldOut']) {
    const split = bundle.splits[name];
    keys(split, ['callIds', 'familyIds']);
    assert.equal(split.callIds.length, count / 2);
    assert.equal(split.familyIds.length, 10);
    assert.deepEqual(split.callIds, callIds.filter(id => split.callIds.includes(id)), 'Split calls must be chronological and unique.');
    assert.deepEqual(split.familyIds, sorted(new Set(split.familyIds)));
    for (const id of split.callIds) { assert.ok(!splitOfCall.has(id)); splitOfCall.set(id, name); }
    for (const id of split.familyIds) { assert.ok(!splitOfFamily.has(id)); splitOfFamily.set(id, name); }
    assert.equal(catalog.filter(e => split.familyIds.includes(e.familyId) && e.kind === 'story').length, 12);
    assert.equal(catalog.filter(e => split.familyIds.includes(e.familyId) && e.kind === 'question').length, 8);
    evidence[name] = { kinds: new Set(), classes: new Set(), pairs: new Set() };
  }
  assert.deepEqual(sorted(splitOfCall.keys()), sorted(callIds));
  assert.deepEqual(sorted(splitOfFamily.keys()), sorted(new Set(catalog.map(e => e.familyId))));
  const histories = new Map(), occurrenceIds = new Set(), negativePairs = new Set(), negativeKinds = new Set();
  const repeatKinds = { unprompted: new Set(), prompted: new Set(), uncertain: new Set() };
  const repeatedVariants = new Map();
  const counts = { new: 0, unprompted: 0, prompted: 0, uncertain: 0 };
  let previousTime = -Infinity, oldRepeat = false;
  for (let index = 0; index < count; index++) {
    const call = bundle.calls[index], truth = bundle.groundTruth[index], timing = bundle.timings[index];
    keys(call, ['elderId', 'callId', 'startedAt', 'endedAt', 'language', 'isSimulated', 'notice', 'timingSource', 'audioPath', 'utterances']);
    assert.equal(call.elderId, persona.elderId);
    assert.equal(call.language, persona.language);
    assert.equal(call.isSimulated, true);
    assert.match(call.notice, /fiction|synthetic|simulat/i);
    assert.equal(call.audioPath, null);
    assert.equal(call.timingSource, 'synthetic_authored');
    assert.match(call.callId, /^call_[a-f0-9]{24}$/);
    assert.equal(call.callId, stableId('call', config.seed, call.startedAt));
    const time = Date.parse(call.startedAt);
    assert.ok(time > previousTime); previousTime = time;
    assert.equal(call.startedAt, new Date(time).toISOString());
    const weekIndex = Math.floor(index / config.callsPerWeek);
    const date = new Date(`${config.startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + weekIndex * 7 + config.weekdays[index % config.callsPerWeek]);
    const p = Object.fromEntries(localTime.formatToParts(new Date(time)).map(part => [part.type, part.value]));
    assert.equal(`${p.year}-${p.month}-${p.day}`, date.toISOString().slice(0, 10));
    assert.equal(`${p.hour}:${p.minute}:${p.second}`, '10:00:00');
    const split = splitOfCall.get(call.callId);
    const expectedSplit = config.callsPerWeek === 3 ? ((weekIndex + index % 3) % 2 === 0 ? 'tuning' : 'heldOut') : (index % config.callsPerWeek % 2 === 0 ? 'tuning' : 'heldOut');
    assert.equal(split, expectedSplit);
    validateTiming(call, timing, config, weekIndex);
    assert.deepEqual(bundle.detectorCalls[index], toDetectorCall(call), 'Detector export must equal the allowlisted canonical copy.');
    keys(truth, ['isSimulated', 'callId', 'reviewStatus', 'occurrences', 'negativePairs']);
    assert.equal(truth.isSimulated, true);
    assert.equal(truth.reviewStatus, 'planted_unreviewed');
    assert.equal(truth.occurrences.length, 5);
    assert.equal(new Set(truth.occurrences.map(o => o.incidentId)).size, 5);
    assert.equal(truth.occurrences.filter(o => o.kind === 'story').length, 3);
    assert.equal(truth.occurrences.filter(o => o.kind === 'question').length, 2);
    const sourceTurns = new Set();
    const authoredDialogue = [{ speaker: 'agent', text: OPENING_TEXT }];
    for (const [slot, occurrence] of truth.occurrences.entries()) {
      keys(occurrence, ['occurrenceId', 'incidentId', 'familyId', 'kind', 'isRepeat', 'elicitation', 'label', 'sourceTurnIndex', 'quote', 'start', 'end', 'promptTurnIndex', 'priorOccurrences']);
      assert.equal(occurrence.occurrenceId, stableId('occurrence', call.callId, slot));
      assert.ok(!occurrenceIds.has(occurrence.occurrenceId)); occurrenceIds.add(occurrence.occurrenceId);
      const entry = byId.get(occurrence.incidentId);
      assert.ok(entry);
      assert.equal(occurrence.familyId, entry.familyId);
      assert.equal(occurrence.kind, entry.kind);
      assert.equal(splitOfFamily.get(entry.familyId), split);
      assert.ok(Object.hasOwn(labels, occurrence.elicitation));
      evidence[split].kinds.add(entry.kind); evidence[split].classes.add(occurrence.elicitation);
      assert.ok(integer(occurrence.sourceTurnIndex));
      assert.ok(!sourceTurns.has(occurrence.sourceTurnIndex)); sourceTurns.add(occurrence.sourceTurnIndex);
      const source = call.utterances[occurrence.sourceTurnIndex];
      assert.equal(source?.speaker, 'caller');
      assert.ok(integer(occurrence.start) && integer(occurrence.end) && occurrence.end > occurrence.start && occurrence.end <= source.text.length);
      assert.equal(source.text.slice(occurrence.start, occurrence.end), occurrence.quote);
      assert.ok(entry.variants.includes(occurrence.quote), 'Quote must retain the authored incident variant.');
      assert.equal(source.text, CALLER_LEAD_IN + occurrence.quote, 'Caller text must be the complete authored form.');
      assert.equal(occurrence.start, CALLER_LEAD_IN.length);
      assert.equal(occurrence.end, CALLER_LEAD_IN.length + occurrence.quote.length);
      const previous = histories.get(entry.id) ?? [];
      assert.equal(occurrence.isRepeat, previous.length > 0);
      assert.equal(occurrence.label, previous.length ? labels[occurrence.elicitation] : 'New material');
      assert.deepEqual(occurrence.priorOccurrences, previous.map(({ callId, occurrenceId }) => ({ callId, occurrenceId })));
      assert.ok(previous.every(row => row.time < time));
      if (previous.length) {
        counts[occurrence.elicitation]++; repeatKinds[occurrence.elicitation].add(entry.kind);
        if (time - previous[0].time > 7 * 86400000) oldRepeat = true;
        if (!repeatedVariants.has(entry.id)) repeatedVariants.set(entry.id, new Set(previous.map(row => row.quote)));
        repeatedVariants.get(entry.id).add(occurrence.quote);
      } else { counts.new++; assert.equal(occurrence.elicitation, 'unprompted'); }
      // Closed-world authored grammar: no inferred NLP classification and no
      // producer renderer call. Every agent turn must be framing, the correct
      // cue, or this entry's response; unprompted entries add no cue turn.
      const promptTurnIndex = occurrence.elicitation === 'prompted' ? authoredDialogue.length : null;
      if (occurrence.elicitation !== 'unprompted') authoredDialogue.push({
        speaker: 'agent', text: occurrence.elicitation === 'prompted' ? entry.specificPrompt : entry.ambiguousPrompt,
      });
      assert.equal(occurrence.promptTurnIndex, promptTurnIndex);
      assert.equal(occurrence.sourceTurnIndex, authoredDialogue.length);
      authoredDialogue.push({ speaker: 'caller', text: CALLER_LEAD_IN + occurrence.quote });
      authoredDialogue.push({ speaker: 'agent', text: entry.response });
    }
    authoredDialogue.push({ speaker: 'agent', text: CLOSING_TEXT });
    assert.deepEqual(call.utterances.map(({ speaker, text }) => ({ speaker, text })), authoredDialogue,
      'All caller and agent text must follow the complete authored dialogue grammar.');
    for (const occurrence of truth.occurrences) {
      const rows = histories.get(occurrence.incidentId) ?? [];
      histories.set(occurrence.incidentId, [...rows, { callId: call.callId, occurrenceId: occurrence.occurrenceId, time, quote: occurrence.quote }]);
    }
    const localPairs = new Set();
    for (const pair of truth.negativePairs) {
      keys(pair, ['incidentIds']);
      assert.equal(pair.incidentIds.length, 2);
      const [a, b] = pair.incidentIds.map(id => byId.get(id));
      assert.ok(a && b && a.id !== b.id);
      assert.equal(a.familyId, b.familyId); assert.equal(a.kind, b.kind);
      assert.notDeepEqual(a.anchors, b.anchors);
      assert.ok(histories.has(a.id) && histories.has(b.id));
      assert.ok(truth.occurrences.some(o => o.familyId === a.familyId));
      assert.equal(splitOfFamily.get(a.familyId), split);
      const key = JSON.stringify(sorted(pair.incidentIds));
      assert.ok(!localPairs.has(key)); localPairs.add(key);
      negativePairs.add(key); negativeKinds.add(a.kind); evidence[split].pairs.add(key);
    }
    const contents = JSON.stringify(call);
    for (const entry of catalog) { assert.ok(!contents.includes(entry.id)); assert.ok(!contents.includes(entry.familyId)); }
  }
  assert.deepEqual(counts, expectedCounts);
  assert.deepEqual(sorted(negativeKinds), ['question', 'story']);
  for (const kinds of Object.values(repeatKinds)) assert.deepEqual(sorted(kinds), ['question', 'story']);
  for (const variants of repeatedVariants.values()) assert.ok(variants.size >= 2);
  for (const split of Object.values(evidence)) {
    assert.deepEqual(sorted(split.kinds), ['question', 'story']);
    assert.deepEqual(sorted(split.classes), ['prompted', 'uncertain', 'unprompted']);
    assert.ok(split.pairs.size > 0);
  }
  if (config.callsPerWeek === 3) { assert.ok(negativePairs.size >= 6); assert.ok(oldRepeat); }
  keys(bundle.manifest, ['schemaVersion', 'generatorVersion', 'catalogVersion', 'isSimulated', 'notice', 'timingSource', 'config', 'seed', 'counts', 'callIds']);
  assert.equal(bundle.manifest.schemaVersion, 1);
  assert.equal(bundle.manifest.generatorVersion, '1.0.0');
  assert.equal(bundle.manifest.catalogVersion, CATALOG_VERSION);
  assert.equal(bundle.manifest.isSimulated, true);
  assert.match(bundle.manifest.notice, /fiction|synthetic|simulat/i);
  assert.equal(bundle.manifest.timingSource, 'synthetic_authored');
  assert.equal(bundle.manifest.seed, config.seed);
  assert.deepEqual(bundle.manifest.config, config);
  assert.deepEqual(bundle.manifest.counts, counts);
  assert.deepEqual(bundle.manifest.callIds, callIds);
  return bundle;
}
