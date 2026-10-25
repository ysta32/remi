// Saving family numbers and texting them on request ("text my grandson that I'm in
// trouble"). Texts go out over iMessage (notify.mjs) only to numbers saved in the
// contact book, with per-call and per-day caps, because anyone can call the line.
import { randomUUID } from 'node:crypto';
import { lastFour, normalizePhone } from '../lib/contacts.mjs';
import { maskPhone, missingTextConfig, sendIMessage } from './notify.mjs';

export const MAX_TEXTS_PER_CALL = 3;
export const MAX_TEXTS_PER_DAY = 20;

/** The text the contact receives. Urgent ones ask them to call, and 911 if needed. */
export function textBody({ elderName, message, urgent }) {
  const said = String(message).trim().replace(/\s+/g, ' ').slice(0, 300);
  if (urgent) {
    return `URGENT from Remi, ${elderName}'s AI companion: ${said} ${elderName} may need help right now. Please call ${elderName} right away. If you can't reach them or they may be in danger, call 911.`;
  }
  return `Message from ${elderName}, sent by Remi (their AI companion): "${said}"`;
}

/** Prompt section: who can be texted and how to save a number. */
export function contactsSection(book, name) {
  const saved = book.list().map((c) => `- ${c.label} (number ending ${lastFour(c.phone)})`);
  return `CONTACTS (${name}'s saved numbers; you can text these)
${saved.length ? saved.join('\n') : '(none saved yet)'}
- To save one: when ${name} gives you a number, read it back in groups ("215, 555, 0142. Is that right?"). Only after a clear yes, call save_contact with who it is (like "grandson") and the digits.
- To text: when ${name} asks you to text a saved contact, say in one sentence what you'll send, then call text_contact. Set urgent to true if ${name} is in trouble, hurt, scared, or asks for help; the text then asks the contact to call ${name} and to call 911 if needed.
- Tell ${name} only what the tool result says. You can text saved contacts only, never a number that isn't saved, and at most ${MAX_TEXTS_PER_CALL} texts per call.
- In a SAFETY emergency, still tell ${name} to call 911 first. Then, if a contact is saved, offer to text them.`;
}

/**
 * @param {object} o
 * @param {ReturnType<import('../lib/contacts.mjs').createContactBook>} o.book
 * @param {string} o.elderName
 * @param {string|null} [o.callId]
 * @param {boolean} [o.dryRun]   log instead of sending (tests, mock calls)
 * @param {Function} [o.send]    sendIMessage, injectable for tests
 */
export function createMessagingTools({ book, elderName, callId = null, dryRun = false, send = sendIMessage, log = console.log, env = process.env }) {
  let textsThisCall = 0;

  const saveContact = {
    name: 'save_contact',
    description: `Save a phone number for one of ${elderName}'s people, after reading it back and hearing a yes.`,
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Who it is, e.g. "grandson", "daughter Linda".' },
        phone: { type: 'string', description: 'The number as digits, e.g. "2155550142". Include the country code if they said one.' },
      },
      required: ['label', 'phone'],
      additionalProperties: false,
    },
    execute: ({ label, phone }) => {
      if (!normalizePhone(phone)) return "That doesn't look like a full phone number. Ask for it again, including the area code.";
      const r = book.save(label, phone);
      if (!r.ok) {
        return r.error === 'full' ? 'The contact list is full (10 numbers). Nothing was saved.' : 'Nothing was saved. Ask who the number belongs to.';
      }
      log(`[contacts] saved ${r.contact.label} ${maskPhone(r.contact.phone)}${r.replaced ? ' (replaced)' : ''}`);
      return `Saved ${r.contact.label}, number ending ${lastFour(r.contact.phone)}.${r.replaced ? ' This replaced the number saved before.' : ''} Tell ${elderName} it's saved and that you can text ${r.contact.label} for them anytime.`;
    },
  };

  const textContact = {
    name: 'text_contact',
    description: `Send a text message to one of ${elderName}'s saved contacts, when ${elderName} asks.`,
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'A saved contact, e.g. "grandson".' },
        message: { type: 'string', description: `What ${elderName} wants to say, in one or two short sentences, written as from ${elderName} ("Grandpa is in trouble").` },
        urgent: { type: 'boolean', description: `true if ${elderName} is in trouble, hurt, scared, or asks for help.` },
      },
      required: ['label', 'message', 'urgent'],
      additionalProperties: false,
    },
    execute: ({ label, message, urgent }) => {
      const contact = book.get(label);
      if (!contact) {
        const saved = book.list().map((c) => c.label);
        return `No saved contact called "${label}". ${saved.length ? `Saved: ${saved.join(', ')}.` : 'No numbers are saved yet.'} Do not say a text was sent. Offer to save the number.`;
      }
      if (!String(message ?? '').trim()) return 'The message is empty. Ask what to say.';
      if (textsThisCall >= MAX_TEXTS_PER_CALL || book.sentToday() >= MAX_TEXTS_PER_DAY) {
        return 'No text was sent: the limit for texts has been reached. Say so honestly. If this is an emergency, tell them to call 911.';
      }
      const missing = dryRun ? [] : missingTextConfig(env);
      if (missing.length) {
        log(`[contacts] texting is not set up: fill ${missing.join(', ')} in agent/.env.local`);
        return `No text was sent: texting isn't set up on this phone line yet. Tell ${elderName} honestly that you couldn't send it${urgent ? ', and if they may be in danger, to call 911 now' : ''}.`;
      }
      textsThisCall += 1;
      book.recordSent();
      const body = textBody({ elderName, message, urgent: Boolean(urgent) });
      const key = `remi-text-${callId ?? 'nocall'}-${randomUUID()}`;
      if (dryRun) {
        log(`[contacts] DRY RUN text to ${contact.label} ${maskPhone(contact.phone)} urgent=${Boolean(urgent)}`);
      } else {
        log(`[contacts] texting ${contact.label} ${maskPhone(contact.phone)} urgent=${Boolean(urgent)}`);
        send({ phone: contact.phone, body, idempotencyKey: key })
          .then((r) => log(`[contacts] text to ${contact.label} ${r.ok ? 'queued' : `NOT confirmed: ${r.detail}`}`))
          .catch((err) => log(`[contacts] text error: ${err?.message ?? err}`));
      }
      return `The text to ${contact.label} is being sent now. Tell ${elderName} you're sending it${urgent ? `, and that ${contact.label} is being asked to call them. If they may be in danger, tell them to call 911 now too` : ''}. Don't promise it was delivered.`;
    },
  };

  return [saveContact, textContact];
}
