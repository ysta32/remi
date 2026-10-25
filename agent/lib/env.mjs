// Fills Chert settings that agent/.env.local leaves empty or as YOUR_ placeholders from the
// repo-root .env.local (same project). Values are never logged: only which names came from where.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const PLACEHOLDER = /^(?:YOUR_|<|$)/;
export const SHARED_NAMES = ['CHERT_API_KEY', 'CHERT_PROJECT_ID', 'CHERT_FACETIME_TOKEN', 'CHERT_BASE_URL', 'CHERT_FACETIME_URL', 'CHERT_TENANT'];

export const isUnset = (v) => PLACEHOLDER.test(String(v ?? '').trim());

export function fillSharedEnv(env = process.env, rootFile = new URL('../../.env.local', import.meta.url)) {
  let root = {};
  try { root = parseEnv(readFileSync(rootFile, 'utf8')); } catch { return []; }
  const filled = [];
  for (const name of SHARED_NAMES) {
    if (isUnset(env[name]) && !isUnset(root[name])) { env[name] = root[name]; filled.push(name); }
    else if (isUnset(env[name])) delete env[name];   // a placeholder must not reach the SDK as a URL or key
  }
  return filled;
}
