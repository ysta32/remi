import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenText, createSafetyMonitor, resolveSafetyConfig, familyAlertText } from '../brain/safety.mjs';

const ctx = {
  elder: { preferredName: 'Hal', displayName: 'Harold Bennett', timezone: 'America/New_York' },
  family: { primaryContactName: 'Linda' },
  emergency: { contactName: 'Linda', contactPhone: '+15555550123', mode: 'family', address: '123 Example St' },
};

function harness(env = {}, c = ctx) {
  const events = [];
  const texts = [];
  const dispatches = [];
  const monitor = createSafetyMonitor({
    ctx: c,
    callId: 'call-1',
    postEvent: (e) => events.push(e),
    elapsedMs: () => 1234,
    env,
    deps: {
      sendIMessage: async (m) => { texts.push(m); return { ok: true }; },
      dispatchEmergency: async (d) => { dispatches.push(d); return { ok: true }; },
      now: () => new Date('2026-10-24T19:42:00Z'),
    },
  });
  return { monitor, events, texts, dispatches };
}

test('screenText catches present-tense red flags', () => {
  const cases = [
    ["I can't breathe", 'medical_emergency', 'emergency'],
    ['my chest hurts real bad', 'medical_emergency', 'emergency'],
    ['I think I’m having a heart attack', 'medical_emergency', 'emergency'],
    ["I fell and I can't get up", 'fall', 'emergency'],
    ['I fell in the kitchen this morning', 'fall', 'urgent'],
    ["I've fallen", 'fall', 'urgent'],
    ['sometimes I just want to die', 'self_harm', 'urgent'],
    ["I don't know where I am", 'disorientation', 'urgent'],
    ['a man said to buy him some gift cards', 'exploitation', 'urgent'],
  ];
  for (const [text, category, level] of cases) {
    const hits = screenText(text);
    assert.ok(hits.some((h) => h.category === category && h.level === level), `${text} -> ${JSON.stringify(hits)}`);
  }
});

test('screenText ignores stories and negations', () => {
  for (const text of [
    'I fell in love with Dorothy at a dance',
    "Dad had chest pains back in '79",
    "I don't want to die before the Steelers win again",
    'Sam is going to get me gift cards for Christmas',
    'They had to call an ambulance for my neighbor years ago',
    'I fell asleep in my chair',
  ]) {
    assert.deepEqual(screenText(text), [], text);
  }
});

test('emergency texts the contact once and logs a safety event', async () => {
  const { monitor, events, texts } = harness();
  const reply = monitor.report({ category: 'medical_emergency', level: 'emergency', note: 'Chest pain right now.' });
  monitor.report({ category: 'medical_emergency', level: 'emergency', note: 'Still chest pain.' });
  await monitor.flush(100);

  assert.equal(texts.length, 1);
  assert.equal(texts[0].phone, '+15555550123');
  assert.equal(texts[0].idempotencyKey, 'remi-call-1-medical_emergency-emergency');
  assert.match(texts[0].body, /^URGENT from Remi/);
  assert.match(texts[0].body, /call 911/);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'safety');
  assert.equal(events[0].payload.notified, true);
  assert.equal(events[1].payload.notified, false);
  assert.match(reply, /hang up and call 911/);
  assert.match(reply, /Linda has been sent an alert/);
});

test('urgent then emergency in the same category escalates again', async () => {
  const { monitor, texts } = harness();
  monitor.report({ category: 'fall', level: 'urgent', note: 'Fell this morning.' });
  monitor.report({ category: 'fall', level: 'emergency', note: "Can't get up." });
  await monitor.flush(100);
  assert.equal(texts.length, 2);
});

test('watch level is logged but not texted', async () => {
  const { monitor, events, texts } = harness();
  monitor.report({ category: 'other', level: 'watch', note: 'Feeling a little lonely.' });
  await monitor.flush(100);
  assert.equal(texts.length, 0);
  assert.equal(events.length, 1);
});

test('911 mode dispatches emergencies only when a dispatch URL is set', async () => {
  const withUrl = harness({ SAFETY_MODE: '911', EMERGENCY_DISPATCH_URL: 'https://dispatch.example/alerts' });
  withUrl.monitor.report({ category: 'fall', level: 'emergency', note: "Can't get up." });
  withUrl.monitor.report({ category: 'disorientation', level: 'urgent', note: 'Unsure where he is.' });
  await withUrl.monitor.flush(100);
  assert.equal(withUrl.dispatches.length, 1);
  assert.equal(withUrl.dispatches[0].payload.address, '123 Example St');
  assert.match(withUrl.texts[0].body, /Please call 911 for Hal now/);

  const noUrl = harness({ SAFETY_MODE: '911' });
  noUrl.monitor.report({ category: 'fall', level: 'emergency', note: "Can't get up." });
  await noUrl.monitor.flush(100);
  assert.equal(noUrl.dispatches.length, 0);
  assert.equal(noUrl.texts.length, 1);
});

test('no valid contact: nothing sent, and the model is told not to claim it', async () => {
  const { monitor, texts } = harness({}, { ...ctx, emergency: { contactPhone: '555-0123' } });
  const reply = monitor.report({ category: 'medical_emergency', level: 'emergency', note: 'Chest pain.' });
  await monitor.flush(100);
  assert.equal(texts.length, 0);
  assert.match(reply, /do not say that you told anyone/);
});

test('env overrides context for the demo phone', () => {
  const cfg = resolveSafetyConfig(ctx, { EMERGENCY_CONTACT_PHONE: '+18145550199', SAFETY_MODE: '911' });
  assert.equal(cfg.contactPhone, '+18145550199');
  assert.equal(cfg.mode, '911');
});

test('keyword backstop reports through the same path', async () => {
  const { monitor, events, texts } = harness();
  monitor.screenCallerText("I'm on the floor, I can't get up");
  await monitor.flush(100);
  assert.equal(events[0].payload.source, 'keyword');
  assert.equal(texts.length, 1);
});

test('family alert copy uses the elder timezone and no pronouns', () => {
  const body = familyAlertText({
    name: 'Hal', category: 'fall', level: 'urgent', note: 'Fell this morning.', mode: 'family',
    address: null, at: new Date('2026-10-24T19:42:00Z'), timeZone: 'America/New_York',
  });
  assert.match(body, /3:42/);
  assert.match(body, /Please check on Hal today/);
});
