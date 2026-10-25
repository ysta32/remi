import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContactBook, normalizePhone } from '../lib/contacts.mjs';
import { createMessagingTools, MAX_TEXTS_PER_CALL, textBody } from '../brain/messaging.mjs';
import { buildInstructions } from '../brain/index.mjs';

const ctx = JSON.parse(readFileSync(new URL('../fixtures/context.json', import.meta.url), 'utf8'));
const freshBook = () => createContactBook('elder-test', { dir: mkdtempSync(join(tmpdir(), 'remi-contacts-')) });
const toolsFor = (book, sent = []) => Object.fromEntries(createMessagingTools({
  book, elderName: 'Hal', log: () => {}, env: { CHERT_BASE_URL: 'https://example.test', CHERT_API_KEY: 'k' },
  send: async (m) => { sent.push(m); return { ok: true }; },
}).map((t) => [t.name, t]));

test('normalizePhone: spoken US numbers and E.164', () => {
  assert.equal(normalizePhone('2155550142'), '+12155550142');
  assert.equal(normalizePhone('215-555-0142'), '+12155550142');
  assert.equal(normalizePhone('1 215 555 0142'), '+12155550142');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('555 0142'), null);
  assert.equal(normalizePhone('0155550142'), null);
});

test('save then text the grandson; urgent text asks them to call and mentions 911', async () => {
  const book = freshBook();
  const sent = [];
  const tools = toolsFor(book, sent);
  assert.match(tools.save_contact.execute({ label: 'my Grandson', phone: '2155550142' }), /Saved grandson, number ending 0142/);
  assert.equal(book.get('grandson').phone, '+12155550142');
  assert.equal(statSync(book.file).mode & 0o777, 0o600);

  const reply = tools.text_contact.execute({ label: 'grandson', message: "Grandpa's in trouble.", urgent: true });
  assert.match(reply, /being sent now/);
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].phone, '+12155550142');
  assert.match(sent[0].body, /Grandpa's in trouble\./);
  assert.match(sent[0].body, /call 911/);
  assert.ok(sent[0].idempotencyKey);
});

test('the book persists across calls', () => {
  const book = freshBook();
  toolsFor(book).save_contact.execute({ label: 'grandson', phone: '2155550142' });
  const again = createContactBook('elder-test', { dir: book.file.replace(/\/[^/]+$/, '') });
  assert.equal(again.get('grandson').phone, '+12155550142');
});

test('never texts an unsaved contact, and caps texts per call', async () => {
  const book = freshBook();
  const sent = [];
  const tools = toolsFor(book, sent);
  assert.match(tools.text_contact.execute({ label: 'grandson', message: 'hi', urgent: false }), /No saved contact/);
  tools.save_contact.execute({ label: 'grandson', phone: '2155550142' });
  for (let i = 0; i < MAX_TEXTS_PER_CALL; i += 1) tools.text_contact.execute({ label: 'grandson', message: 'hi', urgent: false });
  assert.match(tools.text_contact.execute({ label: 'grandson', message: 'hi', urgent: false }), /No text was sent/);
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, MAX_TEXTS_PER_CALL);
});

test('rejects a partial number', () => {
  assert.match(toolsFor(freshBook()).save_contact.execute({ label: 'grandson', phone: '5550142' }), /full phone number/);
});

test('plain text quotes the message', () => {
  assert.equal(textBody({ elderName: 'Hal', message: 'Running late', urgent: false }), 'Message from Hal, sent by Remi (their AI companion): "Running late"');
});

test('prompt lists saved contacts by last four digits only', () => {
  const book = freshBook();
  book.save('grandson', '2155550142');
  const text = buildInstructions(ctx, { book, env: {} });
  assert.match(text, /- grandson \(number ending 0142\)/);
  assert.doesNotMatch(text, /2155550142/);
  assert.match(text, /unless text_contact said the text is being sent/);
});

test('says honestly when texting is not set up', () => {
  const book = freshBook();
  book.save('grandson', '2155550142');
  const sent = [];
  const tools = Object.fromEntries(createMessagingTools({
    book, elderName: 'Hal', log: () => {}, env: { CHERT_BASE_URL: 'YOUR_CHERT_BASE_URL', CHERT_API_KEY: 'YOUR_CHERT_API_KEY' },
    send: async (m) => { sent.push(m); return { ok: true }; },
  }).map((t) => [t.name, t]));
  assert.match(tools.text_contact.execute({ label: 'grandson', message: 'hi', urgent: true }), /No text was sent: texting isn't set up.*call 911/);
  assert.equal(sent.length, 0);
});
