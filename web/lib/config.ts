// Shared app config. The product name lives here (and in the agent persona string) only.
import path from 'node:path';

export const APP_NAME = 'Remi';

// D's UI reads fixtures/demo/*.json unless NEXT_PUBLIC_USE_FIXTURES=0 (then the live API).
export const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES !== '0';

const flag = (name: string) => process.env[name] === '1';

export const config = {
  get databasePath() {
    return process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'echo.db');
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
  },
  get devTools() {
    return flag('DEV_TOOLS');
  },
  get demoMode() {
    return flag('DEMO_MODE');
  },
  get agentApiToken() {
    return process.env.AGENT_API_TOKEN || '';
  },
  /** Passcode for the /control panel; the panel is closed when unset. */
  get controlPasscode() {
    return process.env.CONTROL_PASSCODE || '';
  },
  /** The agent folder whose scripts the control panel runs (npm run call|text|contacts). */
  get agentDir() {
    return process.env.AGENT_DIR || path.join(process.cwd(), '..', 'agent');
  },
  /** chert dev's --json log, or a folder of chert-dev-*.jsonl logs, for the panel's line lamp (optional). */
  get chertDevLog() {
    return process.env.CHERT_DEV_LOG || '';
  },
  /** The agent's stdout log, for the last call's latency line on the control panel (optional). */
  get agentLog() {
    return process.env.AGENT_LOG || '';
  },
  /** The elder whose contacts the control panel manages (matches the agent's ELDER_ID). */
  get controlElderId() {
    return process.env.ELDER_ID || 'elder-hal-demo';
  },
  get llmProvider() {
    return (process.env.LLM_PROVIDER || 'openai') as 'openai' | 'gemini';
  },
  get embeddingsProvider() {
    return (process.env.EMBEDDINGS_PROVIDER || 'openai') as 'openai' | 'gemini' | 'none';
  },
  get sttProvider() {
    return (process.env.STT_PROVIDER || 'none') as 'openai' | 'deepgram' | 'none';
  },
};
