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

test('feeling unwell today is an urgent check-in; past illness and moods are not', () => {
  for (const text of ["I don't feel so well today", 'I am feeling dizzy', "I'm not feeling well", 'honestly I feel sick']) {
    assert.ok(screenText(text).some((h) => h.category === 'unwell' && h.level === 'urgent'), text);
  }
  for (const text of ["I didn't feel well back in '79", "I don't feel good about the Eagles' chances", 'she was feeling sick that winter']) {
    assert.ok(!screenText(text).some((h) => h.category === 'unwell'), text);
  }
});

test('SAFETY_ALERT_CONTACT texts a saved contact, named from the family list, even without contract v2', async () => {
  const { savedAlertContact } = await import('../brain/safety.mjs');
  const book = { get: (l) => (l === 'grandson' ? { label: 'grandson', phone: '+12155550142' } : null) };
  const family = { ...ctx, emergency: null, family: { primaryContactName: 'Linda', members: [{ name: 'Sam', relation: 'grandson' }] } };
  const alertContact = savedAlertContact(family, book, { SAFETY_ALERT_CONTACT: 'grandson' });
  assert.deepEqual(alertContact, { name: 'Sam', phone: '+12155550142' });
  assert.equal(savedAlertContact(family, book, {}), null);

  const events = [];
  const texts = [];
  const monitor = createSafetyMonitor({
    ctx: family, callId: 'call-2', postEvent: (e) => events.push(e), elapsedMs: () => 10, env: {}, contractV2: false, alertContact,
    deps: { sendIMessage: async (m) => { texts.push(m); return { ok: true }; }, now: () => new Date('2026-10-24T19:42:00Z') },
  });
  monitor.screenCallerText("I don't feel so well today");
  const guidance = monitor.report({ category: 'self_harm', level: 'urgent', note: 'Said he wants to end it.' });
  await monitor.flush(100);
  assert.equal(texts.length, 2);
  assert.ok(texts.every((t) => t.phone === '+12155550142'));
  assert.match(texts[0].body, /not feeling well/);
  assert.match(guidance, /Sam has been sent an alert/);
  assert.deepEqual(events.map((e) => e.payload.category), ['unwell', 'self_harm']);
});
