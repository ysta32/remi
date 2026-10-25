#!/usr/bin/env node
import { open, readFile } from 'node:fs/promises';
import { analyzeCall } from './src/index.mjs';

const report = (code) => { process.stderr.write(`${code}\n`); process.exitCode = 1; };
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node detector/cli.mjs --input PATH --output PATH\nCredentials: OPENAI_API_KEY; models: OPENAI_EXTRACT_MODEL, OPENAI_EMBED_MODEL\n');
    return;
  }
  const paths = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!['--input', '--output'].includes(name) || Object.hasOwn(paths, name) || !value || value.startsWith('--')) {
      report('INVALID_ARGUMENTS'); return;
    }
    paths[name] = value;
  }
  if (!paths['--input'] || !paths['--output']) { report('INVALID_ARGUMENTS'); return; }
  let input;
  try {
    input = JSON.parse(await readFile(paths['--input'], 'utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some((key) => !['call', 'history', 'processingAllowed'].includes(key))) {
      report('INVALID_INPUT'); return;
    }
  } catch { report('INVALID_INPUT'); return; }
  const env = process.env;
  if ([env.EMBEDDING_DIMENSIONS, env.REPEAT_THRESHOLD].some((value) => value !== undefined && !value.trim())) {
    report('CONFIGURATION_ERROR'); return;
  }
  let output;
  try {
    // Reserve the explicit destination before any paid network work. Never follow
    // an existing symlink or replace an existing result, including on retry.
    output = await open(paths['--output'], 'wx', 0o600);
    await output.chmod(0o600);
  } catch (error) {
    if (output) await output.close().catch(() => {});
    report(error?.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_ERROR'); return;
  }
  try {
    const result = await analyzeCall(input, {
      apiKey: env.OPENAI_API_KEY,
      extractionModel: env.OPENAI_EXTRACT_MODEL ?? env.OPENAI_EXTRACTION_MODEL,
      embeddingModel: env.OPENAI_EMBED_MODEL ?? env.EMBEDDING_MODEL,
      ...(env.EMBEDDING_DIMENSIONS === undefined ? {} : { embeddingDimensions: Number(env.EMBEDDING_DIMENSIONS) }),
      ...(env.REPEAT_THRESHOLD === undefined ? {} : { threshold: Number(env.REPEAT_THRESHOLD) }),
    });
    await output.writeFile(`${JSON.stringify(result, null, 2)}\n`, 'utf8');
    if (result.status !== 'ok') report(result.error.code);
  } catch { report('OUTPUT_ERROR'); }
  finally { await output.close().catch(() => { report('OUTPUT_ERROR'); }); }
}
await main();
