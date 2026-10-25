import test from 'node:test';
import assert from 'node:assert/strict';

// These constraints catch missing/distorted incident identities and renderer evidence.
let catalog, CATALOG_VERSION, persona, renderOccurrence;
try {
  ({ catalog, CATALOG_VERSION } = await import('../catalog/incidents.mjs'));
  ({ persona } = await import('../catalog/persona.mjs'));
  ({ renderOccurrence } = await import('../src/content.mjs'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const words = text => text.trim().split(/\s+/u).length;

test('catalog supplies twenty paired families with the required kinds', () => {
  assert.ok(Array.isArray(catalog), 'authored incident catalog must exist');
  assert.equal(CATALOG_VERSION, '1.0.0');
  assert.equal(catalog.length, 40);
  assert.equal(catalog.filter(e => e.kind === 'story').length, 24);
  assert.equal(catalog.filter(e => e.kind === 'question').length, 16);
  assert.equal(new Set(catalog.map(e => e.id)).size, 40);
  const families = Map.groupBy(catalog, e => e.familyId);
  assert.equal(families.size, 20);
  for (const siblings of families.values()) {
    assert.equal(siblings.length, 2);
    assert.equal(siblings[0].kind, siblings[1].kind);
    assert.notEqual(siblings[0].topic, siblings[1].topic);
    // Each sibling has distinct incident anchors; the full rival identity cannot
    // describe either event, even though the wider subject is deliberately shared.
    for (const [entry, rival] of [siblings, [...siblings].reverse()]) {
      assert.ok(entry.anchors.some(a => !rival.anchors.includes(a)));
      for (const variant of entry.variants) {
        assert.ok(!rival.anchors.every(a => variant.toLowerCase().includes(a.toLowerCase())));
      }
    }
  }
});

test('variants keep incident anchors without IDs and fit authored call lengths', () => {
  assert.ok(catalog, 'authored incident catalog must exist');
  const ids = catalog.flatMap(e => [e.id, e.familyId]);
  for (const entry of catalog) {
    assert.ok(entry.anchors.length >= 2, entry.id);
    assert.ok(entry.variants.length >= 3, entry.id);
    assert.equal(new Set(entry.variants).size, entry.variants.length, entry.id);
    assert.ok(entry.specificPrompt && entry.ambiguousPrompt && entry.response);
    const prose = [...entry.variants, entry.specificPrompt, entry.ambiguousPrompt, entry.response].join(' ');
    for (const id of ids) assert.ok(!prose.includes(id), `${entry.id}: leaked ${id}`);
    for (const variant of entry.variants) {
      for (const anchor of entry.anchors) {
        assert.ok(variant.toLowerCase().includes(anchor.toLowerCase()), `${entry.id}: missing ${anchor}`);
        assert.ok(entry.specificPrompt.toLowerCase().includes(anchor.toLowerCase()), `${entry.id}: vague explicit prompt`);
        assert.ok(!entry.ambiguousPrompt.toLowerCase().includes(anchor.toLowerCase()), `${entry.id}: specific ambiguous cue`);
      }
      const [min, max] = entry.kind === 'story' ? [80, 100] : [30, 45];
      assert.ok(words(variant) >= min && words(variant) <= max, `${entry.id}: ${words(variant)} words`);
      if (entry.kind === 'question') assert.equal((variant.match(/\?/gu) || []).length, 1);
    }
  }
});

test('profile explicitly identifies fictional Hal with a separate synthetic identity', () => {
  assert.ok(persona, 'synthetic persona must exist');
  assert.equal(persona.isSimulated, true);
  assert.notEqual(persona.elderId, 'elder-hal-demo');
  assert.match(persona.elderId, /synthetic/);
  assert.match(persona.notice, /fiction|simulat/i);
  assert.equal(persona.language, 'en');
  assert.equal(persona.timezone, 'America/New_York');
  const profile = JSON.stringify(persona);
  for (const fact of ['Bennett', '81', '38', 'Altoona', '1965', '1967', 'Dorothy', 'Linda', 'Sam', 'Hollidaysburg']) {
    assert.ok(profile.includes(fact), `profile lost ${fact}`);
  }
});

test('rendering preserves exact single-turn source evidence for every variant and elicitation', () => {
  assert.equal(typeof renderOccurrence, 'function');
  for (const entry of catalog) {
    for (let variantIndex = 0; variantIndex < entry.variants.length; variantIndex++) {
      for (const elicitation of ['unprompted', 'prompted', 'uncertain']) {
        const segment = renderOccurrence(entry, { variantIndex, elicitation });
        const prompted = elicitation !== 'unprompted';
        assert.deepEqual(segment.utterances.map(u => u.speaker), prompted ? ['agent', 'caller', 'agent'] : ['caller', 'agent']);
        assert.equal(segment.sourceTurnIndex, prompted ? 1 : 0);
        assert.equal(segment.promptTurnIndex, elicitation === 'prompted' ? 0 : null);
        assert.equal(segment.quote, entry.variants[variantIndex]);
        const source = segment.utterances[segment.sourceTurnIndex].text;
        assert.equal(source.slice(segment.start, segment.end), segment.quote);
        assert.equal(segment.end - segment.start, segment.quote.length);
        if (prompted) assert.equal(segment.utterances[0].text, elicitation === 'prompted' ? entry.specificPrompt : entry.ambiguousPrompt);
        else assert.ok(!segment.utterances.some(u => u.speaker === 'agent' && u.text === entry.specificPrompt));
        assert.equal(segment.utterances.at(-1).text, entry.response);
      }
    }
  }
});

test('Unicode source offsets use UTF-16 and rendering does not mutate the catalog', () => {
  assert.equal(typeof renderOccurrence, 'function');
  const entry = Object.freeze({
    variants: Object.freeze(['Dorothy’s 🧵 sewing tin held café buttons.']),
    specificPrompt: 'Tell me about the sewing tin.',
    ambiguousPrompt: 'Was there something else?', response: 'I can picture it.'
  });
  const segment = renderOccurrence(entry, { variantIndex: 0, elicitation: 'prompted' });
  const source = segment.utterances[1].text;
  assert.equal(segment.quote, 'Dorothy’s 🧵 sewing tin held café buttons.');
  assert.equal(segment.end - segment.start, 42);
  assert.equal(source.slice(segment.start, segment.end), segment.quote);
  segment.utterances[1].text = 'changed';
  assert.equal(entry.variants[0], 'Dorothy’s 🧵 sewing tin held café buttons.');
});

test('invalid variants and elicitation fail instead of silently rendering different evidence', () => {
  assert.equal(typeof renderOccurrence, 'function');
  const entry = { variants: ['One event.'], specificPrompt: 'Which event?', ambiguousPrompt: 'And then?', response: 'I see.' };
  for (const variantIndex of [-1, 1, 0.5, NaN, '0', undefined]) {
    assert.throws(() => renderOccurrence(entry, { variantIndex, elicitation: 'unprompted' }));
  }
  for (const elicitation of ['new', '', undefined]) {
    assert.throws(() => renderOccurrence(entry, { variantIndex: 0, elicitation }));
  }
});

// A question repeated weeks later must ask the same recurring rule, not a new
// week's appointment/event. These four fixtures previously shifted their referent.
for (const [id, identity] of [
  ['qu03a', 'usual visit day'],
  ['qu03b', 'usual Sunday arrival time'],
  ['qu05a', 'usual room name'],
  ['qu07b', 'usual Thursday order deadline']
]) {
  test(`${id} retains a recurring question identity across weeks`, () => {
    assert.ok(catalog, 'authored incident catalog must exist');
    const entry = catalog.find(e => e.id === id);
    assert.ok(entry.anchors.includes(identity), `${id}: anchor must identify the recurring rule`);
    for (const text of [...entry.variants, entry.specificPrompt]) {
      assert.ok(text.includes(identity), `${id}: question/prompt lost its recurring identity`);
      assert.doesNotMatch(text, /\b(?:this|next)\s+(?:week|Sunday|Thursday)\b|\bthat day\b|\bagreed\b/iu);
    }
    assert.match(entry.response, /usual|regular|recurring|weekly/iu, `${id}: response must retain recurring scope`);
    // Every rendering retains the stable query, regardless of caller initiative.
    for (const elicitation of ['unprompted', 'prompted', 'uncertain']) {
      for (let variantIndex = 0; variantIndex < entry.variants.length; variantIndex++) {
        const segment = renderOccurrence(entry, { variantIndex, elicitation });
        assert.ok(segment.quote.includes(identity));
        assert.equal(segment.utterances[segment.sourceTurnIndex].text.slice(segment.start, segment.end), segment.quote);
      }
    }
  });
}

test('uncertain cue refers back to an unidentified prior item rather than giving a generic invitation', () => {
  assert.ok(catalog, 'authored incident catalog must exist');
  for (const entry of catalog) {
    const segment = renderOccurrence(entry, { variantIndex: 0, elicitation: 'uncertain' });
    assert.equal(segment.utterances[0].speaker, 'agent');
    const cue = segment.utterances[0].text;
    assert.match(cue, /\bgo back\b/iu);
    assert.match(cue, /\bthat one you mentioned\b/iu);
    assert.match(cue, /\bwhich one you meant\b/iu);
    assert.equal(segment.promptTurnIndex, null);
    assert.equal(segment.sourceTurnIndex, 1);
    assert.equal(segment.utterances[segment.sourceTurnIndex].speaker, 'caller');
    assert.equal(segment.quote, entry.variants[0]);
    for (const anchor of entry.anchors) assert.ok(!cue.toLowerCase().includes(anchor.toLowerCase()));
    assert.doesNotMatch(cue, /uncertain|unprompted|prompted|repeat|incident|planted/iu);
  }
});
