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
    turnSilenceMs: int(env.TURN_SILENCE_MS, 700),
    vadThreshold: Number.parseFloat(env.VAD_THRESHOLD) || 0.6,
    // near_field for a phone held close; far_field when it sits on a table on speaker.
    noiseReduction: env.NOISE_REDUCTION === 'near_field' ? 'near_field' : 'far_field',
    // lib/turn-guard.mjs: echo guard (ECHO_GUARD=0 for plain full duplex) and loud-speech barge-in.
    echoGuard: env.ECHO_GUARD !== '0',
    bargeIn: env.BARGE_IN !== '0',
    bargeMinRms: Number.parseFloat(env.BARGE_MIN_RMS) || 0.02,
    turnDetection: env.TURN_DETECTION === 'semantic' ? 'semantic' : 'server',
    // Newest model, smarter than gpt-realtime; gpt-realtime-2.1-mini answers ~150 ms sooner.
    realtimeModel: env.REALTIME_MODEL || 'gpt-realtime-2.1',
    voice: env.REALTIME_VOICE || 'marin',
    agentName: env.AGENT_NAME || 'remi',
  };
}
