// Sends one iMessage from the line, as the control panel's "Send text".
// usage: npm run text -- --to <contact label | phone> --body "text" [--as-remi]
//   --as-remi  wraps it like Remi's in-call texts ("Message from Hal, sent by Remi…")
// One JSON record on stdout. The number is only ever shown as its last four digits.
import { randomUUID } from 'node:crypto';
import { fillSharedEnv } from '../lib/env.mjs';
import { createContactBook, normalizePhone, lastFour } from '../lib/contacts.mjs';
import { readConfig } from '../lib/config.mjs';
import { sendIMessage, missingTextConfig } from '../brain/notify.mjs';
import { textBody } from '../brain/messaging.mjs';

fillSharedEnv();
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const out = (r) => { process.stdout.write(`${JSON.stringify(r)}\n`); };
const to = opt('to');
const body = opt('body');
if (!to || !body) { out({ ok: false, error: 'usage: npm run text -- --to <label|phone> --body "text"' }); process.exit(2); }
const missing = missingTextConfig();
if (missing.length) { out({ ok: false, error: `fill in agent/.env.local: ${missing.join(', ')}` }); process.exit(3); }

const config = readConfig();
const book = createContactBook(config.elderId);
const contact = book.get(to);
const phone = contact?.phone ?? normalizePhone(to);
if (!phone) { out({ ok: false, error: `no saved contact "${to}" and not a phone number` }); process.exit(2); }
const text = args.includes('--as-remi') ? textBody({ elderName: opt('elder') || 'Hal', message: body }) : body;
const r = await sendIMessage({ phone, body: text, idempotencyKey: `remi-panel-${randomUUID()}` });
if (r.ok) book.recordSent();
out({ ok: r.ok, to: contact ? contact.label : null, last4: lastFour(phone), detail: r.detail });
process.exit(r.ok ? 0 : 1);
