#!/usr/bin/env node
import { runAudio } from './src/audio-run.mjs';
import { listVoices } from './src/audio-config.mjs';
const usage = `Opt-in SIMULATED OpenAI audio (Node.js 24+). Defaults to offline dry run.
Usage: node synthetic/audio-cli.mjs --input SOURCE [--limit N] [--max-characters N]
       node synthetic/audio-cli.mjs --input SOURCE --generate --output NEW_DIR --cache DIR [--limit N] [--max-characters N]
       node synthetic/audio-cli.mjs --list-voices

--input DIR          Existing canonical transcript bundle; required except standalone modes.
--generate           Explicitly enable paid synthesis; otherwise no output or network.
--output DIR         Fresh output directory under an existing nonsymlink parent (live only).
--cache DIR          Explicit PCM cache directory, created if needed (live only).
--limit N            Earliest N calls, integer 1..all (default all).
--max-characters N   Positive integer cap on the whole selected plan (default 100000).
--list-voices        Standalone built-in voice listing; offline, no credentials.
--help               Show help alone.

Live credentials: OPENAI_API_KEY. Optional voices: OPENAI_TTS_CALLER_VOICE (cedar), OPENAI_TTS_AGENT_VOICE (marin).
Use Node --env-file=synthetic/.env.local before the script path; never put secrets in flags.
`;
function invalid() { throw Object.assign(new Error('Invalid arguments'), { code: 'SYNTHETIC_AUDIO_ARGUMENTS_INVALID' }); }
function parse(args) {
  if (args.length === 1 && ['--help', '--list-voices'].includes(args[0])) return { mode: args[0] };
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (Object.hasOwn(values, flag)) invalid();
    if (flag === '--generate') { values[flag] = true; continue; }
    if (!['--input', '--output', '--cache', '--limit', '--max-characters'].includes(flag)) invalid();
    const value = args[++i]; if (!value || value.startsWith('--')) invalid();
    if (['--limit', '--max-characters'].includes(flag) && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) invalid();
    values[flag] = value;
  }
  if (!values['--input'] || (!values['--generate'] && (values['--output'] || values['--cache']))) invalid();
  return values;
}
try {
  const args = parse(process.argv.slice(2));
  if (args.mode === '--help') process.stdout.write(usage);
  else if (args.mode === '--list-voices') {
    process.stdout.write(`${JSON.stringify(listVoices())}\n`);
  } else {
    const summary = await runAudio({ inputDir: args['--input'], outputDir: args['--output'], cacheDir: args['--cache'], generate: args['--generate'] ?? false,
      limit: args['--limit'] === undefined ? undefined : Number(args['--limit']), maxCharacters: args['--max-characters'] === undefined ? undefined : Number(args['--max-characters']),
      callerVoiceId: process.env.OPENAI_TTS_CALLER_VOICE, agentVoiceId: process.env.OPENAI_TTS_AGENT_VOICE, apiKey: process.env.OPENAI_API_KEY });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  }
} catch (error) {
  const allowed = new Set(['ARGUMENTS_INVALID', 'OPTIONS_INVALID', 'SOURCE_INVALID', 'PATH_UNSAFE', 'CHARACTER_CAP', 'OUTPUT_EXISTS', 'OUTPUT_UNSAFE', 'OUTPUT_INCOMPLETE'].map(suffix => `SYNTHETIC_AUDIO_${suffix}`));
  process.stderr.write(`${allowed.has(error?.code) ? error.code : 'SYNTHETIC_AUDIO_FAILED'}\n`); process.exitCode = 1;
}
