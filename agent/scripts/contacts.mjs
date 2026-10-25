// Manage the numbers Remi can text.
//   npm run contacts                         list
//   npm run contacts -- add grandson 2155550142
//   npm run contacts -- remove grandson
// ELDER_ID picks the elder (default elder-hal-demo). Numbers print masked.
import { createContactBook, lastFour } from '../lib/contacts.mjs';

const elderId = process.env.ELDER_ID || 'elder-hal-demo';
const book = createContactBook(elderId);
const [cmd = 'list', label, phone] = process.argv.slice(2);

if (cmd === 'add') {
  const r = book.save(label, phone);
  if (!r.ok) { console.error(`not saved: ${r.error}`); process.exit(2); }
  console.log(`saved ${r.contact.label} (ending ${lastFour(r.contact.phone)})${r.replaced ? ', replaced the old number' : ''}`);
} else if (cmd === 'remove') {
  console.log(book.remove(label) ? `removed ${label}` : `no contact ${label}`);
} else {
  const list = book.list();
  console.log(list.length ? list.map((c) => `${c.label}: ending ${lastFour(c.phone)}`).join('\n') : '(no contacts)');
  console.log(`${elderId}, ${book.sentToday()} texts in the last 24 h`);
}
