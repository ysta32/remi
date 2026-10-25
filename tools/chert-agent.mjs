#!/usr/bin/env node
// Project-local Chert wrapper for Remi.
//
// These are GENERATED PROJECT COMMANDS, not Chert CLI commands. The wrapper
// emits its own versioned JSON Lines contract (`wrapper_schema_version`) and
// passes Chert's own records through untouched. It never parses human prose as
// a success signal.
//
// Capabilities the published packages do not provide fail closed:
//   - outbound FaceTime call start/watch/end  -> capability_pending
//   - iMessage inbox / receive / watch        -> capability_pending

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATE_DIR = join(ROOT, '.chert-agent');
const STATE_FILE = join(STATE_DIR, 'state.json');
const ENV_FILE = join(ROOT, '.env.local');

const FACETIME_PKG = '@trychert/facetime@0.1.0-beta.10';
const SDK_PKG = '@trychert/sdk@0.1.0';

const SECRET_VARS = [
  'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'OPENAI_API_KEY',
  'CHERT_BASE_URL', 'CHERT_API_KEY', 'CHERT_FACETIME_URL', 'CHERT_FACETIME_TOKEN',
];

function emit(record) {
  process.stdout.write(JSON.stringify({ wrapper_schema_version: 1, ...record }) + '\n');
}

// Values are never logged — only whether each name is present and non-placeholder.
function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function envReport(env) {
  const report = {};
  for (const name of [...SECRET_VARS, 'AGENT_NAME', 'CHERT_PROJECT_ID']) {
    const v = env[name] ?? process.env[name];
    report[name] = !v ? 'missing' : v.startsWith('YOUR_') ? 'placeholder' : 'present';
  }
  return report;
}

function run(pkg, args, { env = {}, capture = true } = {}) {
  return new Promise((resolve) => {
    const child = spawn(
      'bunx', ['--yes', '--package', pkg, ...args],
      { cwd: ROOT, env: { ...process.env, ...env }, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' },
    );
    let stdout = '', stderr = '';
    if (capture) {
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
    }
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function readState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function writeState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// --- commands ----------------------------------------------------------------

async function cmdSetup() {
  const env = loadEnvFile();
  emit({
    command: 'setup',
    code: 'setup_preview',
    env_file: existsSync(ENV_FILE) ? '.env.local present' : '.env.local missing — copy env.local.template',
    variables: envReport(env),
    writes_planned: [],
    note: 'Read-only preview. Fill .env.local yourself (mode 0600), then run `health`.',
  });
}

async function cmdHealth(flags) {
  const env = loadEnvFile();
  const args = ['chert', 'doctor', '--json'];
  // `doctor --agent` dispatches a real test job, so it needs explicit approval.
  if (flags.has('--approve-test-job')) {
    const name = env.AGENT_NAME || process.env.AGENT_NAME;
    if (!name) {
      emit({ command: 'health', code: 'usage_error', detail: 'AGENT_NAME is not set in .env.local.' });
      process.exit(2);
    }
    args.push('--agent', name);
  }
  const doctor = await run(FACETIME_PKG, args, { env });
  for (const line of doctor.stdout.split('\n').filter(Boolean)) process.stdout.write(line + '\n');

  emit({
    command: 'health',
    code: doctor.code === 0 ? 'health_ok' : 'health_problems',
    identity_checked: true,
    // A passing doctor proves sign-in and config, never working audio/video.
    media_readiness: 'unverified',
    agent_test_job: flags.has('--approve-test-job') ? 'requested' : 'not_requested',
    variables: envReport(env),
    chert_exit_code: doctor.code,
  });
  process.exit(doctor.code === 0 ? 0 : 3);
}

async function cmdStatus() {
  const env = loadEnvFile();
  const reads = {};
  for (const [key, args] of [
    ['context', ['chert-sdk', 'context']],
    ['facetime_status', ['chert-sdk', 'facetime', 'status']],
    ['facetime_lines', ['chert-sdk', 'facetime', 'lines']],
    ['facetime_workers', ['chert-sdk', 'facetime', 'workers']],
  ]) {
    const r = await run(SDK_PKG, args, { env });
    // The SDK reports configuration errors on stderr, so fall back to it.
    const payload = (r.stdout.trim() || r.stderr.trim()).split('\n').pop();
    try { reads[key] = JSON.parse(payload); }
    catch { reads[key] = { error: 'unparseable', exit_code: r.code }; }
  }
  const state = readState();
  emit({
    command: 'status',
    code: 'status_report',
    sdk_reads: reads,
    local_connector: state && processAlive(state.pid)
      ? { running: true, pid: state.pid, started_at: state.started_at }
      : { running: false },
    note: 'Identity and line reads are not call readiness.',
  });
}

async function cmdStart(flags) {
  const env = loadEnvFile();
  const name = env.AGENT_NAME || process.env.AGENT_NAME;

  if (!flags.has('--approve-incoming-calls')) {
    emit({
      command: 'start',
      code: 'approval_required',
      detail: '`chert dev` makes the line reachable by incoming callers. Re-run with --approve-incoming-calls.',
    });
    process.exit(4);
  }
  if (!name) {
    emit({ command: 'start', code: 'usage_error', detail: 'AGENT_NAME is not set in .env.local.' });
    process.exit(2);
  }
  const existing = readState();
  if (existing && processAlive(existing.pid)) {
    emit({ command: 'start', code: 'already_running', pid: existing.pid });
    process.exit(4);
  }

  emit({
    command: 'start',
    code: 'starting',
    agent: name,
    foreground: true,
    // No service manager is implemented: no always-on, no restart recovery.
    always_on: false,
    note: 'Start your own agent runtime in a separate terminal first; chert dev only bridges calls to it.',
  });

  const child = spawn(
    'bunx', ['--yes', '--package', FACETIME_PKG, 'chert', 'dev', '--agent', name, '--json'],
    { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' },
  );
  writeState({ pid: child.pid, agent: name, started_at: new Date().toISOString() });
  child.on('close', (code) => {
    rmSync(STATE_FILE, { force: true });
    emit({ command: 'start', code: 'dev_exited', chert_exit_code: code });
    process.exit(code ?? 0);
  });
}

async function cmdWatch(flags, args) {
  if (args[0] === 'imessage') {
    emit({
      command: 'watch',
      code: 'capability_pending',
      surface: 'imessage_receive',
      detail: 'The published SDK has no iMessage inbox or watch command. Nothing was started.',
    });
    process.exit(4);
  }
  // A watch may only relay events from its own `chert dev --json` process.
  return cmdStart(flags);
}

async function cmdMessage(flags) {
  const env = loadEnvFile();
  const to = process.env.APPROVED_E164;
  const body = process.env.APPROVED_MESSAGE;
  const key = process.env.STABLE_REQUEST_ID;

  // Setup approval is not send approval: every real send needs a fresh one.
  if (!flags.has('--approve') || !to || !body || !key) {
    emit({
      command: 'message',
      code: 'approval_required',
      detail: 'Set APPROVED_E164, APPROVED_MESSAGE and STABLE_REQUEST_ID in the environment and pass --approve.',
      recipient: to ?? null,
      reason: 'The exact recipient and body must be confirmed immediately before each send.',
    });
    process.exit(4);
  }

  const r = await run(SDK_PKG, [
    'chert-sdk', 'imessage', 'send',
    '--phone', to, '--body', body, '--idempotency-key', key,
  ], { env });

  let parsed = null;
  try { parsed = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* keep raw exit code */ }

  if (r.code !== 0 || !parsed) {
    emit({
      command: 'message',
      code: 'unconfirmed_text_outcome',
      idempotency_key: key,
      detail: 'Outcome uncertain. Do NOT resend automatically — reconcile with the service using this same key.',
      chert_exit_code: r.code,
    });
    process.exit(4);
  }
  emit({
    command: 'message',
    code: 'queued_receipt',
    idempotency_key: key,
    // HTTP 202 queued is a receipt, never proof of delivery.
    delivery_confirmed: false,
    service_response: parsed,
  });
}

async function cmdCall() {
  emit({
    command: 'call',
    code: 'capability_pending',
    surface: 'facetime_outbound',
    detail: 'No published SDK method starts a FaceTime call. No route was invented and nothing was dialled.',
  });
  process.exit(4);
}

async function cmdStop() {
  const state = readState();
  if (!state || !processAlive(state.pid)) {
    rmSync(STATE_FILE, { force: true });
    emit({ command: 'stop', code: 'not_running' });
    return;
  }
  process.kill(state.pid, 'SIGINT'); // one SIGINT only; never SIGKILL
  emit({ command: 'stop', code: 'sigint_sent', pid: state.pid, detail: 'Waiting for confirmed binding release.' });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (!processAlive(state.pid)) {
      rmSync(STATE_FILE, { force: true });
      emit({
        command: 'stop',
        code: 'connector_exited',
        released: 'unconfirmed',
        detail: 'Check the dev_stopped record. A release_failed or cleanup_pending record is NOT a release.',
        line_allocation: 'still assigned — stopping the connector does not unassign the number',
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  emit({
    command: 'stop',
    code: 'cleanup_pending',
    pid: state.pid,
    detail: 'Release still in progress after 60s. Do not send further interrupts; ask the project owner/admin.',
  });
  process.exit(4);
}

// --- dispatch ----------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const [command, ...rest] = positional;

const COMMANDS = {
  setup: () => cmdSetup(),
  health: () => cmdHealth(flags),
  status: () => cmdStatus(),
  start: () => cmdStart(flags),
  watch: () => cmdWatch(flags, rest),
  message: () => cmdMessage(flags),
  call: () => cmdCall(),
  stop: () => cmdStop(),
};

if (!command || !COMMANDS[command]) {
  emit({
    command: 'help',
    code: 'usage',
    commands: Object.keys(COMMANDS),
    pending_capabilities: ['call (outbound FaceTime)', 'watch imessage (inbound iMessage)'],
    detail: 'Project-local wrapper commands, not Chert CLI commands.',
  });
  process.exit(command ? 2 : 0);
}

await COMMANDS[command]();
