// Every runtime flag the agent reads, in one place. Defaults are the safe choice for a
// live call. Names match docs/contracts.md §1 and the root .env.example.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const AGENT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const TMP_DIR = join(AGENT_DIR, 'tmp');

const on = (v) => v === '1' || v === 'true';
const int = (v, d) => (Number.isFinite(Number.parseInt(v, 10)) ? Number.parseInt(v, 10) : d);

export function readConfig(env = process.env) {
  return {
    apiBase: (env.ECHO_API_BASE || 'http://localhost:3000').replace(/\/+$/, ''),
    apiToken: env.AGENT_API_TOKEN || '',
    elderId: env.ELDER_ID || 'elder-hal-demo',
    mockContext: on(env.MOCK_CONTEXT),
    // Greet when the caller joins instead of on bridge_ready. Browser testing only:
    // on a real FaceTime call the caller may still be connecting.
    greetOnJoin: on(env.GREET_ON_JOIN),
    // Kevin's extended contract (memory prompts, emergency contact, safety levels,
    // family alerts). Off: only event types main's backend accepts are ever sent.
    contractV2: on(env.CONTRACT_V2),
    captureAudio: on(env.CAPTURE_AUDIO),
    demoMode: on(env.DEMO_MODE),
    // End-of-turn silence for the realtime model's server VAD (contracts default 1000).
    // TURN_DETECTION=semantic keeps the plugin's semantic VAD instead.
    turnSilenceMs: int(env.TURN_SILENCE_MS, 1000),
    turnDetection: env.TURN_DETECTION === 'semantic' ? 'semantic' : 'server',
    realtimeModel: env.REALTIME_MODEL || 'gpt-realtime',
    voice: env.REALTIME_VOICE || 'marin',
    agentName: env.AGENT_NAME || 'remi',
  };
}
