import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCallMemory } from '../lib/call-memory.mjs';

test('remembers what the caller said and what Remi asked', () => {
  let t = 0;
  const m = createCallMemory({ now: () => t, t0: 0 });
  assert.equal(m.section('Hal'), '');
  m.add('assistant', "Hi Hal, it's Remi. How has your day been?");
  t = 5000; m.add('user', 'Pretty good, I spent the morning in the tomato garden.');
  t = 65000; m.add('user', 'My grandson Sam is visiting on Sunday.');
  const s = m.section('Hal');
  assert.match(s, /SO FAR IN THIS CALL/);
  assert.match(s, /\[0:05\] Pretty good, I spent the morning in the tomato garden\./);
  assert.match(s, /\[1:05\] My grandson Sam is visiting on Sunday\./);
  assert.match(s, /- How has your day been\?/);
  assert.equal(m.callerTurns, 2);
});

test('stays within budget on a long call, keeping the start and the latest lines', () => {
  const m = createCallMemory({ maxChars: 1200 });
  for (let i = 0; i < 200; i += 1) m.add('user', `line ${i} ${'x'.repeat(60)}`);
  const s = m.section('Hal');
  assert.ok(s.length < 1400, `${s.length} chars`);
  assert.match(s, /line 0 /);
  assert.match(s, /line 199 /);
  assert.match(s, /earlier lines left out/);
});
