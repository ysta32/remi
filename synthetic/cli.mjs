#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolveConfig } from './src/contracts.mjs';

const usage = `Offline synthetic Remi call generator (no credentials or network).\nUsage: node synthetic/cli.mjs [--config FILE] --output NEW_DIRECTORY\n\n--config FILE  Raw JSON configuration; defaults to config/default.json.\n--output DIR   New directory under an existing nonsymlink parent; never overwrites.\n--help         Show this help (use alone).\n`;
function invalid() { throw Object.assign(new Error('Invalid arguments'), { code: 'SYNTHETIC_ARGUMENTS_INVALID' }); }
function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!['--config', '--output'].includes(flag) || Object.hasOwn(parsed, flag) || typeof value !== 'string' || !value || value.startsWith('--')) invalid();
    parsed[flag] = value;
  }
  if (!parsed['--output']) invalid();
  return parsed;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(usage); return; }
  let raw;
  try {
    const source = args['--config'] ?? new URL('./config/default.json', import.meta.url);
    raw = JSON.parse(await readFile(source, 'utf8'));
    resolveConfig(raw);
  } catch { throw Object.assign(new Error('Invalid configuration'), { code: 'SYNTHETIC_CONFIG_INVALID' }); }
  // Load producer and publication only after strict argument/config checks; help is independent.
  const { generateBundle } = await import('./src/generate.mjs');
  const { writeBundle } = await import('./src/write.mjs');
  const bundle = generateBundle(raw);
  await writeBundle(bundle, args['--output']);
}
try { await main(); } catch (error) {
  const allowed = new Set(['SYNTHETIC_ARGUMENTS_INVALID', 'SYNTHETIC_CONFIG_INVALID', 'SYNTHETIC_OUTPUT_EXISTS', 'SYNTHETIC_OUTPUT_UNSAFE', 'SYNTHETIC_OUTPUT_FAILED', 'SYNTHETIC_OUTPUT_INCOMPLETE', 'SYNTHETIC_BUNDLE_INVALID']);
  process.stderr.write(`${allowed.has(error?.code) ? error.code : 'SYNTHETIC_GENERATION_FAILED'}\n`);
  process.exitCode = 1;
}
