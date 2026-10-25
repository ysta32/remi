// Control panel actions. Calls and texts run the agent's own scripts (agent/scripts/*), so the
// Chert and LiveKit credentials stay in agent/.env.local and never pass through the web app.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';

type JobLine = Record<string, unknown> & { at?: string };
export type Job = {
  id: string;
  kind: 'call';
  label: string;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  lines: JobLine[];
};

type JobEntry = { job: Job; child: ChildProcess | null };
const store = globalThis as unknown as { __remiJobs?: Map<string, JobEntry> };
const jobs = () => (store.__remiJobs ??= new Map());

const lastFour = (s: string) => s.replace(/\D/g, '').slice(-4);

// The agent's own .env.local owns its Chert/LiveKit credentials. node --env-file never
// overrides variables already set, so drop the web app's copies (web/.env.local may hold
// older ones) before handing the environment to the agent scripts.
const AGENT_OWNED = /^(CHERT_|LIVEKIT_|AGENT_NAME$)/;

function npmRun(script: string, args: string[]): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' };
  for (const k of Object.keys(env)) if (AGENT_OWNED.test(k)) delete env[k];
  return spawn('npm', ['run', '-s', script, '--', ...args], {
    cwd: config.agentDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseLines(buf: string): { lines: JobLine[]; rest: string } {
  const parts = buf.split('\n');
  const rest = parts.pop() ?? '';
  const lines: JobLine[] = [];
  for (const p of parts) {
    if (!p.trim()) continue;
    try { lines.push(JSON.parse(p)); } catch { lines.push({ step: 'log', text: p.slice(0, 300) }); }
  }
  return { lines, rest };
}

/** Starts Remi calling someone; progress lands in the job's lines. */
export function startCall(to: string, video: boolean): Job {
  const job: Job = {
    id: randomUUID(), kind: 'call', label: `Remi → ***${lastFour(to)}`,
    startedAt: new Date().toISOString(), endedAt: null, exitCode: null, lines: [],
  };
  const child = npmRun('call', [to, ...(video ? [] : ['--audio-only'])]);
  let out = '';
  child.stdout?.on('data', (d) => { const r = parseLines(out + d); out = r.rest; job.lines.push(...r.lines); });
  child.stderr?.on('data', (d) => { job.lines.push({ step: 'stderr', text: String(d).trim().slice(0, 300) }); });
  child.on('close', (code) => { job.exitCode = code; job.endedAt = new Date().toISOString(); });
  child.on('error', (err) => { job.lines.push({ step: 'error', error: err.message }); job.endedAt = new Date().toISOString(); });
  jobs().set(job.id, { job, child });
  return job;
}

/** Hangs up: the call script ends the Chert call on SIGINT. */
export function endJob(id: string): boolean {
  const e = jobs().get(id);
  if (!e?.child || e.job.endedAt) return false;
  e.child.kill('SIGINT');
  return true;
}

export const listJobs = (): Job[] => [...jobs().values()].map((e) => e.job).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10);

/** Runs a short agent script and returns its last JSON line. */
function runOnce(script: string, args: string[], timeoutMs = 30_000): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const child = npmRun(script, args);
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ ok: false, error: 'timed out' }); }, timeoutMs);
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      const last = out.trim().split('\n').pop() ?? '';
      try { resolve(JSON.parse(last)); } catch { resolve({ ok: code === 0, output: last.slice(0, 300), error: code === 0 ? undefined : err.trim().split('\n').pop()?.slice(0, 300) }); }
    });
  });
}

export const sendText = (to: string, body: string, asRemi: boolean) =>
  runOnce('text', ['--to', to, '--body', body, ...(asRemi ? ['--as-remi'] : [])]);

export const saveContact = (label: string, phone: string) => runOnce('contacts', ['add', label, phone]);

/** Saved contacts as label + last four digits only. */
export function listContacts(elderId: string): { label: string; last4: string }[] {
  const file = path.join(config.agentDir, 'tmp', 'contacts', `${elderId}.json`);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { contacts?: { label: string; phone: string }[] };
    return (data.contacts ?? []).map((c) => ({ label: c.label, last4: lastFour(c.phone) }));
  } catch { return []; }
}

/** CHERT_DEV_LOG is a chert dev --json log, or a folder of chert-dev-*.jsonl (newest wins). */
function newestChertLog(p: string): string | null {
  if (!p || !existsSync(p)) return null;
  if (!statSync(p).isDirectory()) return p;
  const logs = readdirSync(p).filter((f) => /^chert-dev-.*\.jsonl$/.test(f)).map((f) => path.join(p, f));
  return logs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/** Is the agent worker running, and what did chert dev last say about the line? */
export async function systemStatus() {
  const running = (pattern: string) => new Promise<boolean>((resolve) => {
    const p = spawn('pgrep', ['-f', pattern]);
    p.on('close', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
  const [agent, chertDev] = await Promise.all([running('agent.mjs start'), running('chert dev')]);
  let line: { code: string; at: string } | null = null;
  const devLog = newestChertLog(config.chertDevLog);
  if (devLog) {
    const tail = readFileSync(devLog, 'utf8').slice(-20_000).trim().split('\n').reverse();
    for (const l of tail) {
      try {
        const r = JSON.parse(l) as { code?: string; at?: string };
        if (r.code && /^(agent_warm|agent_not_warm|call_accepted|call_ended|call_declined|dev_stopped|line_in_use|reconnecting|dev_reconnected)$/.test(r.code)) { line = { code: r.code, at: r.at ?? '' }; break; }
      } catch { /* not JSON */ }
    }
  }
  let latency: string | null = null;
  if (config.agentLog && existsSync(config.agentLog)) {
    const hit = readFileSync(config.agentLog, 'utf8').slice(-200_000).match(/\[lat\] call:[^\n]*/g);
    latency = hit ? hit[hit.length - 1].replace('[lat] call:', '').trim().slice(0, 200) : null;
  }
  return { agent, chertDev, line, latency };
}
