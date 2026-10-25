import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCall } from '../../detector/src/index.mjs';

// These acceptance checks derive expectations from the approved public contract,
// not producer summaries or validateBundle. Missing modules are explicit RED gaps.
let generateBundle, writeBundle, bundleFiles, catalog;
try { ({ catalog } = await import('../catalog/incidents.mjs')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
try { ({ generateBundle } = await import('../src/generate.mjs')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
try { ({ writeBundle, bundleFiles } = await import('../src/write.mjs')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const generate = (config = {}) => {
  assert.equal(typeof generateBundle, 'function', 'generateBundle must implement the agreed public API');
  return generateBundle(config);
};
const labels = { unprompted: 'Unprompted repeat', prompted: 'Prompted retelling', uncertain: 'Uncertain' };
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = values => [...values].sort(lexical);
const key = (callId, occurrenceId) => JSON.stringify([callId, occurrenceId]);
const expectedCounts = {
  2: { new: 20, unprompted: 12, prompted: 6, uncertain: 2 },
  3: { new: 30, unprompted: 18, prompted: 9, uncertain: 3 },
  4: { new: 40, unprompted: 24, prompted: 12, uncertain: 4 },
};
const local = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function localParts(instant) {
  return Object.fromEntries(local.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
}
// Shared by complete-bundle acceptance and deliberately corrupted source probes.
function assertIncidentEvidence(call, occurrence, entry) {
  const source = call.utterances[occurrence.sourceTurnIndex];
  assert.equal(source.speaker, 'caller');
  assert.ok(Number.isInteger(occurrence.start) && occurrence.start >= 0);
  assert.ok(Number.isInteger(occurrence.end) && occurrence.end > occurrence.start);
  assert.equal(source.text.slice(occurrence.start, occurrence.end), occurrence.quote);
  assert.ok(entry.variants.includes(occurrence.quote), 'quote must be an authored variant of its identified incident');
  for (const anchor of entry.anchors) {
    assert.ok(occurrence.quote.toLowerCase().includes(anchor.toLowerCase()), 'quote must retain its identified incident anchors');
  }
  if (occurrence.elicitation === 'prompted') {
    assert.ok(Number.isInteger(occurrence.promptTurnIndex));
    assert.ok(occurrence.promptTurnIndex < occurrence.sourceTurnIndex);
    assert.equal(call.utterances[occurrence.promptTurnIndex].speaker, 'agent');
    assert.equal(call.utterances[occurrence.promptTurnIndex].text, entry.specificPrompt, 'prompted evidence must use the identified incident specificPrompt');
  } else {
    assert.equal(occurrence.promptTurnIndex, null);
    if (occurrence.elicitation === 'uncertain') {
      assert.equal(call.utterances[occurrence.sourceTurnIndex - 1]?.speaker, 'agent');
      assert.equal(call.utterances[occurrence.sourceTurnIndex - 1].text, entry.ambiguousPrompt, 'uncertain evidence must use the identified incident ambiguousPrompt');
    }
  }
}
function acceptance(bundle, callsPerWeek) {
  const { calls, detectorCalls, groundTruth, timings, splits } = bundle;
  assert.ok(Array.isArray(catalog), 'authored catalog is required for independent family checks');
  const catalogById = new Map(catalog.map(entry => [entry.id, entry]));
  const callIds = calls.map(c => c.callId);
  assert.equal(calls.length, 4 * callsPerWeek);
  assert.equal(new Set(callIds).size, callIds.length);
  for (const rows of [detectorCalls, groundTruth, timings]) assert.deepEqual(rows.map(r => r.callId), callIds);
  assert.deepEqual(bundle.manifest.callIds, callIds);
  assert.equal(bundle.profile.isSimulated, true);
  assert.equal(bundle.manifest.isSimulated, true);
  assert.equal(splits.isSimulated, true);
  assert.match(bundle.profile.notice, /fiction|synthetic|simulat/i);
  const splitByCall = new Map();
  const families = {};
  for (const name of ['tuning', 'heldOut']) {
    const split = splits[name];
    assert.equal(new Set(split.callIds).size, split.callIds.length);
    assert.equal(new Set(split.familyIds).size, split.familyIds.length);
    families[name] = new Set(split.familyIds);
    for (const id of split.callIds) {
      assert.equal(splitByCall.has(id), false, 'call partitions must be disjoint');
      splitByCall.set(id, name);
    }
  }
  assert.deepEqual(sorted(splitByCall.keys()), sorted(callIds));
  assert.ok([...families.tuning].every(id => !families.heldOut.has(id)), 'negative siblings stay in one family partition');
  const totals = { new: 0, unprompted: 0, prompted: 0, uncertain: 0 };
  const priorByIncident = new Map();
  const seenOccurrences = new Set();
  const pairKeys = new Set();
  const splitEvidence = { tuning: { kinds: new Set(), classes: new Set(), negatives: 0 }, heldOut: { kinds: new Set(), classes: new Set(), negatives: 0 } };
  const repeatKinds = { unprompted: new Set(), prompted: new Set(), uncertain: new Set() };
  const negativeKinds = new Set();
  let oldRepeat = false;
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i], exported = detectorCalls[i], truth = groundTruth[i], timing = timings[i];
    const splitName = splitByCall.get(call.callId), evidence = splitEvidence[splitName];
    if (i) assert.ok(Date.parse(calls[i - 1].startedAt) < Date.parse(call.startedAt));
    const p = localParts(call.startedAt);
    const date = new Date(`${bundle.config.startDate}T00:00:00Z`);
    const weekdays = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] }[callsPerWeek];
    date.setUTCDate(date.getUTCDate() + Math.floor(i / callsPerWeek) * 7 + weekdays[i % callsPerWeek]);
    assert.equal(`${p.year}-${p.month}-${p.day}`, date.toISOString().slice(0, 10));
    assert.equal(`${p.hour}:${p.minute}`, '10:00');
    assert.equal(call.elderId, bundle.profile.elderId);
    for (const row of [call, exported, truth, timing]) assert.equal(row.isSimulated, true);
    assert.equal(call.timingSource, 'synthetic_authored');
    assert.equal(timing.timingSource, 'synthetic_authored');
    assert.equal(call.audioPath, null);
    assert.match(timing.notice, /authored/i);
    assert.match(timing.notice, /no audio.*measur|no.*measured.*audio/i);
    assert.equal(truth.reviewStatus, 'planted_unreviewed');
    assert.equal(truth.occurrences.length, 5);
    assert.equal(truth.occurrences.filter(o => o.kind === 'story').length, 3);
    assert.equal(truth.occurrences.filter(o => o.kind === 'question').length, 2);
    assert.equal(new Set(truth.occurrences.map(o => o.incidentId)).size, 5);
    assert.deepEqual(Object.keys(exported).sort(), ['callId', 'elderId', 'isSimulated', 'startedAt', 'utterances'].sort());
    assert.deepEqual(parseCall(exported), exported);
    assert.deepEqual(exported.utterances, call.utterances.map(({ speaker, text, startMs, endMs }) => ({ speaker, text, startMs, endMs })));
    for (const field of ['split', 'incidentId', 'familyId', 'expected', 'label', 'groundTruth', 'pauses']) assert.equal(Object.hasOwn(call, field), false);
    for (const occurrence of truth.occurrences) {
      const { incidentId, occurrenceId, familyId, kind, elicitation, isRepeat } = occurrence;
      assert.equal(seenOccurrences.has(occurrenceId), false);
      seenOccurrences.add(occurrenceId);
      assert.ok(families[splitName].has(familyId));
      evidence.kinds.add(kind); evidence.classes.add(elicitation);
      const entry = catalogById.get(incidentId);
      assert.ok(entry, 'truth incident is backed by the authored catalog');
      assert.equal(entry.familyId, familyId);
      assert.equal(entry.kind, kind);
      if (isRepeat) repeatKinds[elicitation].add(kind);
      assertIncidentEvidence(call, occurrence, entry);
      assert.equal(exported.utterances[occurrence.sourceTurnIndex].text.slice(occurrence.start, occurrence.end), occurrence.quote);
      const previous = priorByIncident.get(incidentId) ?? [];
      assert.equal(isRepeat, previous.length > 0, 'first occurrence must precede every repeat');
      assert.equal(occurrence.label, isRepeat ? labels[elicitation] : 'New material');
      totals[isRepeat ? elicitation : 'new']++;
      assert.deepEqual(sorted(occurrence.priorOccurrences.map(p => key(p.callId, p.occurrenceId))), sorted(previous.map(p => key(p.callId, p.occurrenceId))));
      for (const p of previous) {
        assert.equal(p.familyId, familyId);
        assert.equal(p.kind, kind);
        assert.ok(p.time < Date.parse(call.startedAt), 'same-call and future references are forbidden');
        if (Date.parse(call.startedAt) - p.time > 7 * 86400000) oldRepeat = true;
      }
    }
    // Add only after checking the entire call: a repeat cannot cite a peer turn.
    for (const o of truth.occurrences) {
      const rows = priorByIncident.get(o.incidentId) ?? [];
      rows.push({ ...o, callId: call.callId, time: Date.parse(call.startedAt) });
      priorByIncident.set(o.incidentId, rows);
    }
    const duration = Date.parse(call.endedAt) - Date.parse(call.startedAt);
    assert.ok(duration >= 180000 && duration <= 300000, `duration ${duration}`);
    assert.equal(call.utterances.at(-1).endMs, duration, 'no terminal padding');
    const wordCount = call.utterances.filter(u => u.speaker === 'caller').reduce((n, u) => n + u.words.length, 0);
    assert.ok(wordCount >= 100);
    const weekIndex = Math.floor(i / callsPerWeek);
    assert.equal(timing.weekIndex, weekIndex);
    assert.equal(timing.pauseCenterMs, [600, 850, 1100, 1400][weekIndex]);
    assert.equal(timing.pauses.length, 8);
    const pauseByBoundary = new Map();
    for (const pause of timing.pauses) {
      const turn = call.utterances[pause.turnIndex];
      assert.equal(turn.speaker, 'caller');
      assert.equal(pause.kind, 'planted');
      assert.ok(Number.isInteger(pause.afterWordIndex) && pause.afterWordIndex >= 0);
      assert.ok(pause.afterWordIndex + 1 < turn.words.length);
      assert.equal(pause.startMs, turn.words[pause.afterWordIndex].endMs);
      assert.equal(pause.endMs, turn.words[pause.afterWordIndex + 1].startMs);
      assert.equal(pause.durationMs, pause.endMs - pause.startMs);
      assert.ok(Math.abs(pause.durationMs - timing.pauseCenterMs) <= 75);
      const boundary = key(pause.turnIndex, pause.afterWordIndex);
      assert.equal(pauseByBoundary.has(boundary), false);
      pauseByBoundary.set(boundary, pause);
    }
    let previousTurnEnd = 0;
    for (const [turnIndex, turn] of call.utterances.entries()) {
      assert.ok(Number.isInteger(turn.startMs) && turn.startMs >= previousTurnEnd);
      assert.ok(Number.isInteger(turn.endMs) && turn.endMs > turn.startMs);
      previousTurnEnd = turn.endMs;
      if (turn.speaker !== 'caller') continue;
      assert.deepEqual(turn.words.map(w => w.w), turn.text.match(/\S+/gu));
      for (const [wordIndex, word] of turn.words.entries()) {
        assert.ok(Number.isInteger(word.startMs) && Number.isInteger(word.endMs));
        assert.ok(word.startMs >= turn.startMs && word.endMs <= turn.endMs && word.endMs > word.startMs);
        if (wordIndex) {
          const gap = word.startMs - turn.words[wordIndex - 1].endMs;
          assert.ok(gap >= 0);
          if (!pauseByBoundary.has(key(turnIndex, wordIndex - 1))) assert.ok(gap < 400);
        }
      }
    }
  }
  // Resolve negative semantics from actual occurrences, independently of summaries.
  const first = new Map([...priorByIncident].map(([id, rows]) => [id, rows[0]]));
  for (const truth of groundTruth) for (const pair of truth.negativePairs) {
    assert.equal(pair.incidentIds.length, 2);
    const [a, b] = pair.incidentIds.map(id => first.get(id));
    assert.ok(a && b, 'both negative incidents must appear in the corpus');
    assert.notEqual(a.incidentId, b.incidentId);
    assert.equal(a.familyId, b.familyId);
    assert.equal(catalogById.get(a.incidentId).familyId, catalogById.get(b.incidentId).familyId);
    assert.notDeepEqual(catalogById.get(a.incidentId).anchors, catalogById.get(b.incidentId).anchors);
    negativeKinds.add(a.kind);
    assert.equal(a.kind, b.kind);
    assert.equal(splitByCall.get(a.callId), splitByCall.get(b.callId));
    assert.notEqual(a.quote, b.quote);
    pairKeys.add(JSON.stringify(sorted(pair.incidentIds)));
    splitEvidence[splitByCall.get(a.callId)].negatives++;
  }
  for (const ids of [calls, detectorCalls]) for (const row of ids) {
    const contents = JSON.stringify(row);
    for (const incident of catalog) {
      assert.equal(contents.includes(incident.id), false, 'incident IDs stay out of canonical and detector artifacts');
      assert.equal(contents.includes(incident.familyId), false, 'family IDs stay out of canonical and detector artifacts');
    }
  }
  for (const kinds of Object.values(repeatKinds)) assert.deepEqual(sorted(kinds), ['question', 'story']);
  assert.deepEqual(sorted(negativeKinds), ['question', 'story']);
  for (let week = 0; week < 4; week++) {
    const weekly = calls.slice(week * callsPerWeek, (week + 1) * callsPerWeek);
    const tuningCount = weekly.filter(call => splitByCall.get(call.callId) === 'tuning').length;
    assert.equal(tuningCount, callsPerWeek === 3 ? [2, 1, 2, 1][week] : callsPerWeek / 2);
  }
  assert.deepEqual(totals, expectedCounts[callsPerWeek]);
  assert.deepEqual(bundle.manifest.counts, expectedCounts[callsPerWeek]);
  for (const evidence of Object.values(splitEvidence)) {
    assert.deepEqual(sorted(evidence.kinds), ['question', 'story']);
    assert.deepEqual(sorted(evidence.classes), ['prompted', 'uncertain', 'unprompted']);
    assert.ok(evidence.negatives > 0);
  }
  if (callsPerWeek === 3) { assert.ok(pairKeys.size >= 6); assert.ok(oldRepeat); }
  return bundle;
}

// Mutate data in memory only. These probes establish that the same evidence
// checker used by acceptance rejects metadata/prose mismatches independently of
// any detector output or semantic-accuracy judgment.
function evidenceFixture(bundle, elicitation) {
  for (let i = 0; i < bundle.groundTruth.length; i++) {
    const found = bundle.groundTruth[i].occurrences.find(o => !elicitation || o.elicitation === elicitation);
    if (found) return { call: structuredClone(bundle.calls[i]), occurrence: structuredClone(found),
      entry: catalog.find(entry => entry.id === found.incidentId) };
  }
  assert.fail(`fixture requires ${elicitation} source evidence`);
}

test('mutation probe: sibling incident prose cannot retain another incident identity', async () => {
  const { call, occurrence, entry } = evidenceFixture(await generate());
  const sibling = catalog.find(candidate => candidate.familyId === entry.familyId && candidate.id !== entry.id);
  assert.ok(sibling);
  occurrence.quote = sibling.variants[0]; occurrence.start = 0; occurrence.end = occurrence.quote.length;
  call.utterances[occurrence.sourceTurnIndex].text = occurrence.quote;
  assert.throws(() => assertIncidentEvidence(call, occurrence, entry), /quote must be an authored variant of its identified incident/);
});

test('mutation probe: a generic opener cannot substitute for the identified specific prompt', async () => {
  const { call, occurrence, entry } = evidenceFixture(await generate(), 'prompted');
  call.utterances[occurrence.promptTurnIndex].text = 'How are you today?';
  assert.throws(() => assertIncidentEvidence(call, occurrence, entry), /prompted evidence must use the identified incident specificPrompt/);
});

test('mutation probe: uncertain elicitation requires the identified ambiguous cue', async () => {
  const { call, occurrence, entry } = evidenceFixture(await generate(), 'uncertain');
  call.utterances[occurrence.sourceTurnIndex - 1].text = 'How are you today?';
  assert.throws(() => assertIncidentEvidence(call, occurrence, entry), /uncertain evidence must use the identified incident ambiguousPrompt/);
});

test('default corpus preserves exact counts, source alignment, chronological references, splits and authored timing', async () => {
  const bundle = acceptance(await generate(), 3);
  assert.equal(bundle.calls[0].startedAt, '2026-09-28T14:00:00.000Z');
  assert.equal(bundle.calls.at(-1).startedAt, '2026-10-23T14:00:00.000Z');
  assert.equal(bundle.config.seed, 42);
});

for (const callsPerWeek of [2, 3, 4]) for (const seed of [0, 42, 4294967295]) {
  test(`bounded seed/preset acceptance: seed ${seed}, ${callsPerWeek} calls/week`, async () => {
    acceptance(await generate({ seed, callsPerWeek }), callsPerWeek);
  });
}

for (const [startDate, firstInstant, lastInstant, elapsed] of [
  ['2026-10-19', '2026-10-19T14:00:00.000Z', '2026-11-13T15:00:00.000Z', 25 * 86400000 + 3600000],
  ['2026-03-02', '2026-03-02T15:00:00.000Z', '2026-03-27T14:00:00.000Z', 25 * 86400000 - 3600000],
  ['2026-12-21', '2026-12-21T15:00:00.000Z', '2027-01-15T15:00:00.000Z', 25 * 86400000],
]) test(`New York 10:00 chronology handles DST/year rollover from ${startDate}`, async () => {
  const bundle = await generate({ startDate });
  assert.equal(bundle.calls[0].startedAt, firstInstant);
  assert.equal(bundle.calls.at(-1).startedAt, lastInstant);
  assert.equal(Date.parse(lastInstant) - Date.parse(firstInstant), elapsed);
  for (const [index, call] of bundle.calls.entries()) {
    const p = localParts(call.startedAt);
    const date = new Date(`${startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Math.floor(index / 3) * 7 + [0, 2, 4][index % 3]);
    assert.equal(`${p.year}-${p.month}-${p.day}`, date.toISOString().slice(0, 10));
    assert.equal(`${p.hour}:${p.minute}`, '10:00');
    assert.equal(Date.parse(call.endedAt) - Date.parse(call.startedAt), call.utterances.at(-1).endMs);
  }
});

test('same config publishes byte-identical files and independently verifiable SHA256 digests in distinct directories', async () => {
  assert.equal(typeof writeBundle, 'function', 'exclusive bundle writer must exist');
  assert.equal(typeof bundleFiles, 'function', 'deterministic file serializer must exist');
  const root = await mkdtemp(join(await realpath(tmpdir()), 'remi-integration-'));
  try {
    const a = await generate(), b = await generate();
    const files = await bundleFiles(a);
    const filesB = await bundleFiles(b);
    assert.ok(files instanceof Map);
    assert.deepEqual([...files], [...filesB]);
    assert.equal([...files.keys()].at(-1), 'manifest.json');
    const dirs = [join(root, 'one'), join(root, 'two')];
    await writeBundle(a, dirs[0]); await writeBundle(b, dirs[1]);
    const manifest = JSON.parse(files.get('manifest.json'));
    assert.deepEqual(sorted(Object.keys(manifest.files)), sorted([...files.keys()].filter(path => path !== 'manifest.json')));
    assert.equal(Object.hasOwn(manifest.files, 'manifest.json'), false);
    assert.equal(files.size, 4 * a.calls.length + 4);
    for (const [path, contents] of files) {
      assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
      const first = await readFile(join(dirs[0], path));
      const second = await readFile(join(dirs[1], path));
      assert.deepEqual(first, second, path);
      assert.equal(first.toString('utf8'), contents, path);
      assert.ok(contents.endsWith('\n'));
      assert.equal(contents.includes('\r'), false);
      if (path === 'manifest.json') continue;
      assert.equal(manifest.files[path], createHash('sha256').update(first).digest('hex'), path);
      if (path.endsWith('.json')) assert.equal(JSON.parse(contents).isSimulated, true, path);
      else assert.match(contents, /synthetic|simulat|fiction/i);
    }
    const differentBundle = await generate({ seed: 43 });
    const different = await bundleFiles(differentBundle);
    assert.notDeepEqual([...different], [...files], 'seed changes must affect the produced corpus');
    // Exclude IDs, config, timestamps and notices: metadata-only changes cannot
    // satisfy seeded linguistic/timing variation. Words carry only token timing.
    const authoredContent = bundle => bundle.calls.map(call => call.utterances.map(turn => ({
      speaker: turn.speaker, text: turn.text, startMs: turn.startMs, endMs: turn.endMs,
      words: turn.words?.map(({ w, startMs, endMs }) => ({ w, startMs, endMs })),
    })));
    assert.notDeepEqual(authoredContent(differentBundle), authoredContent(a), 'seed must change dialogue or authored timing content');
  } finally { await rm(root, { recursive: true, force: true }); }
});
