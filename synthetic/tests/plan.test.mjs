import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/contracts.mjs';
import { planCalls } from '../src/plan.mjs';

// Complete independent fixture: scheduling must not depend on authored prose.
const fixture = Array.from({ length: 40 }, (_, i) => ({
  id: `fixture_incident_${i}`, familyId: `fixture_family_${Math.floor(i / 2)}`,
  kind: i < 24 ? 'story' : 'question', topic: `fixture topic ${i}`,
  anchors: [`fixture anchor ${i}`], variants: ['First telling.', 'Another telling.', 'Third telling.'],
  specificPrompt: 'Please tell me about that particular event.', ambiguousPrompt: 'What comes to mind?',
  response: 'Thank you for sharing that.',
}));

for (const callsPerWeek of [2, 3, 4]) for (const seed of [0, 1, 42, 4294967295]) {
  test(`bounded schedule preserves totals, history and split purity: ${callsPerWeek}/week seed ${seed}`, () => {
    const config = resolveConfig({ callsPerWeek, seed });
    const plan = planCalls(config, fixture);
    const expected = { 2: [20, 12, 6, 2], 3: [30, 18, 9, 3], 4: [40, 24, 12, 4] }[callsPerWeek];
    assert.deepEqual(plan.counts, Object.fromEntries(['new', 'unprompted', 'prompted', 'uncertain'].map((key, i) => [key, expected[i]])));
    assert.equal(plan.calls.length, callsPerWeek * 4);
    assert.deepEqual(plan, planCalls(config, structuredClone(fixture)));
    const actual = { new: 0, unprompted: 0, prompted: 0, uncertain: 0 };
    const histories = new Map();
    const families = new Map();
    const occurrenceIds = new Set();
    let previous = '';
    let longGap = false;
    for (const call of plan.calls) {
      assert.ok(call.startedAt > previous); previous = call.startedAt;
      assert.match(call.callId, /^call_[a-f0-9]{24}$/);
      assert.equal(call.occurrences.length, 5);
      assert.equal(new Set(call.occurrences.map(o => o.incidentId)).size, 5);
      assert.equal(call.occurrences.filter(o => o.kind === 'story').length, 3);
      assert.equal(call.occurrences.filter(o => o.kind === 'question').length, 2);
      for (const o of call.occurrences) {
        assert.ok(!occurrenceIds.has(o.occurrenceId)); occurrenceIds.add(o.occurrenceId);
        assert.ok(['unprompted', 'prompted', 'uncertain'].includes(o.elicitation));
        assert.ok(o.variantIndex >= 0 && o.variantIndex < 3);
        const prior = histories.get(o.incidentId) ?? [];
        if (o.category === 'new') assert.equal(prior.length, 0);
        else {
          assert.ok(prior.length > 0);
          assert.equal(o.elicitation, o.category);
          assert.ok(prior.every(p => p.startedAt < call.startedAt));
          assert.ok(prior.some(p => p.variantIndex !== o.variantIndex));
          if (Date.parse(call.startedAt) - Date.parse(prior[0].startedAt) > 7 * 86400000) longGap = true;
        }
        actual[o.category]++;
        histories.set(o.incidentId, [...prior, { startedAt: call.startedAt, variantIndex: o.variantIndex }]);
        assert.ok(!families.has(o.familyId) || families.get(o.familyId) === call.split);
        families.set(o.familyId, call.split);
        assert.ok(plan.splits[call.split].familyIds.includes(o.familyId));
        assert.ok(plan.splits[call.split].callIds.includes(call.callId));
      }
    }
    for (const category of ['unprompted', 'prompted', 'uncertain']) {
      assert.deepEqual(new Set(plan.calls.flatMap(c => c.occurrences).filter(o => o.category === category).map(o => o.kind)), new Set(['story', 'question']));
    }
    assert.deepEqual(actual, plan.counts);
    assert.ok(longGap);
    assert.equal(plan.splits.isSimulated, true);
    assert.equal(plan.splits.tuning.familyIds.length, 10);
    assert.equal(plan.splits.heldOut.familyIds.length, 10);
    assert.equal(new Set([...plan.splits.tuning.familyIds, ...plan.splits.heldOut.familyIds]).size, 20);
    for (const split of ['tuning', 'heldOut']) {
      const calls = plan.calls.filter(c => c.split === split);
      assert.equal(calls.length, callsPerWeek * 2);
      assert.deepEqual(new Set(calls.flatMap(c => c.occurrences.map(o => o.category))), new Set(['new', 'unprompted', 'prompted', 'uncertain']));
      assert.deepEqual(new Set(calls.flatMap(c => c.occurrences.map(o => o.kind))), new Set(['story', 'question']));
      const familyIncidents = new Map();
      for (const o of calls.flatMap(c => c.occurrences)) {
        if (!familyIncidents.has(o.familyId)) familyIncidents.set(o.familyId, new Set());
        familyIncidents.get(o.familyId).add(o.incidentId);
      }
      assert.ok([...familyIncidents.values()].some(ids => ids.size === 2));
    }
    if (callsPerWeek === 3) {
      assert.deepEqual([0, 1, 2, 3].map(w => plan.calls.filter(c => c.weekIndex === w && c.split === 'tuning').length), [2, 1, 2, 1]);
      assert.ok([...new Set(fixture.map(e => e.familyId))].filter(f => fixture.filter(e => e.familyId === f).every(e => histories.has(e.id))).length >= 6);
    }
  });
}

test('calendar uses New York 10:00 across spring DST, fall DST and year rollover', () => {
  for (const [startDate, dates] of [
    ['2026-03-02', ['2026-03-02T15:00:00.000Z', '2026-03-09T14:00:00.000Z']],
    ['2026-10-26', ['2026-10-26T14:00:00.000Z', '2026-11-02T15:00:00.000Z']],
    ['2026-12-28', ['2026-12-28T15:00:00.000Z', '2027-01-04T15:00:00.000Z']],
  ]) {
    const calls = planCalls(resolveConfig({ startDate, callsPerWeek: 2 }), fixture).calls;
    assert.equal(calls[0].startedAt, dates[0]);
    assert.equal(calls[2].startedAt, dates[1]);
  }
});

test('schedule varies by seed, ignores catalog ordering and never mutates its input', () => {
  const before = structuredClone(fixture);
  const first = planCalls(resolveConfig(), fixture);
  assert.deepEqual(fixture, before);
  assert.deepEqual(first, planCalls(resolveConfig(), [...fixture].reverse()));
  assert.notDeepEqual(first, planCalls(resolveConfig({ seed: 1 }), fixture));
});
