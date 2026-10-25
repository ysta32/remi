// Saved phone numbers per elder ("grandson" → +17545550123), kept on this computer in
// tmp/contacts/<elderId>.json (git-ignored). Remi can text only numbers saved here.
// Sync file I/O: the file is tiny and touched a few times per call.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TMP_DIR } from './config.mjs';

export const CONTACTS_DIR = join(TMP_DIR, 'contacts');
export const MAX_CONTACTS = 10;
const DAY_MS = 86400000;

/** Spoken or typed number → E.164, or null. Ten digits are taken as a US number. */
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** "my Grandson " → "grandson". */
export function normalizeLabel(raw) {
  return String(raw ?? '').toLowerCase().replace(/^(?:my|the|our)\s+/, '').replace(/[^\p{L}\p{N} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export const lastFour = (phone) => String(phone).slice(-4);

export function createContactBook(elderId, { dir = CONTACTS_DIR, now = () => Date.now() } = {}) {
  const file = join(dir, `${String(elderId).replace(/[^\w.-]/g, '_')}.json`);

  function load() {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      return { contacts: data.contacts ?? [], sent: data.sent ?? [] };
    } catch {
      return { contacts: [], sent: [] };
    }
  }
  function store(data) {
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(tmp, file);
  }

  return {
    file,
    list: () => load().contacts,
    get(label) {
      const want = normalizeLabel(label);
      return load().contacts.find((c) => c.label === want) ?? null;
    },
    /** → { ok, contact?, replaced?, error? } */
    save(label, phone) {
      const l = normalizeLabel(label);
      const p = normalizePhone(phone);
      if (!l) return { ok: false, error: 'no_label' };
      if (!p) return { ok: false, error: 'bad_number' };
      const data = load();
      const i = data.contacts.findIndex((c) => c.label === l);
      if (i < 0 && data.contacts.length >= MAX_CONTACTS) return { ok: false, error: 'full' };
      const contact = { label: l, phone: p, savedAt: new Date(now()).toISOString() };
      const replaced = i >= 0 ? data.contacts[i] : null;
      if (i >= 0) data.contacts[i] = contact; else data.contacts.push(contact);
      store(data);
      return { ok: true, contact, replaced };
    },
    remove(label) {
      const data = load();
      const before = data.contacts.length;
      data.contacts = data.contacts.filter((c) => c.label !== normalizeLabel(label));
      if (data.contacts.length !== before) store(data);
      return data.contacts.length !== before;
    },
    /** Texts sent in the last 24 h, across calls. */
    sentToday: () => load().sent.filter((t) => now() - Date.parse(t) < DAY_MS).length,
    recordSent() {
      const data = load();
      data.sent = [...data.sent.filter((t) => now() - Date.parse(t) < DAY_MS), new Date(now()).toISOString()];
      store(data);
    },
  };
}
