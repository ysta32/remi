// Remi calls someone on FaceTime. One JSON record per line on stdout.
// usage: npm run call -- +15555550123 [--audio-only]     (or an Apple ID email)
import { fillSharedEnv } from '../lib/env.mjs';
import { placeCall, missingCallConfig } from '../lib/outbound.mjs';

fillSharedEnv();
const args = process.argv.slice(2);
const to = args.find((a) => !a.startsWith('--'));
const out = (r) => process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), ...r })}\n`);
if (!to) { out({ step: 'error', error: 'usage: npm run call -- <phone or Apple ID>' }); process.exit(2); }
const missing = missingCallConfig();
if (missing.length) { out({ step: 'error', error: `fill in agent/.env.local: ${missing.join(', ')}` }); process.exit(3); }
const stop = new AbortController();
process.on('SIGINT', () => stop.abort());
process.on('SIGTERM', () => stop.abort());
try {
  const r = await placeCall({ to, video: !args.includes('--audio-only'), onStatus: out, signal: stop.signal });
  process.exit(r.status === 'ended' ? 0 : 1);
} catch (err) {
  out({ step: 'error', error: err.message, code: err.code ?? null, status: err.status ?? null });
  process.exit(1);
}
