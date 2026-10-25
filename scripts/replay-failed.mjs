#!/usr/bin/env node
// Re-send backend requests the call agent could not deliver (agent/tmp/failed/).
//   node --env-file=agent/.env.local scripts/replay-failed.mjs [--dry]
// Bundles (createCall failed) are replayed as create → events → complete.
// A replayed file moves to agent/tmp/failed/done/.
import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createApi } from '../agent/lib/api.mjs';
import { FAILED_DIR } from '../agent/lib/call-session.mjs';

const dry = process.argv.includes('--dry');
const api = createApi();
const files = (await readdir(FAILED_DIR).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
if (!files.length) { console.log('nothing to replay'); process.exit(0); }
await mkdir(join(FAILED_DIR, 'done'), { recursive: true });

let failed = 0;
for (const name of files) {
  const file = join(FAILED_DIR, name);
  const item = JSON.parse(await readFile(file, 'utf8'));
  if (dry) { console.log(`would replay ${item.kind}: ${name}`); continue; }
  let ok = false;
  if (item.kind === 'event') ok = (await api.postEvent(item.callId, item.body)).ok;
  else if (item.kind === 'complete') ok = (await api.completeCall(item.callId, item.body)).ok;
  else if (item.kind === 'bundle') {
    const created = await api.createCall(item.create);
    if (created.callId) {
      for (const ev of item.events) await api.postEvent(created.callId, ev);
      ok = (await api.completeCall(created.callId, item.complete)).ok;
      if (ok) console.log(`bundle replayed as call ${created.callId}`);
    }
  }
  console.log(`${ok ? 'replayed' : 'still failing'}: ${name}`);
  if (ok) await rename(file, join(FAILED_DIR, 'done', name));
  else failed += 1;
}
process.exit(failed ? 1 : 0);
