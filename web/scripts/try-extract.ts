// Runs extractCall on a /complete fixture with the real provider and prints the JSON.
// Run from web/: npx tsx scripts/try-extract.ts ../fixtures/transcripts/hal-first-car.json
// Reads OPENAI_API_KEY etc. from web/.env.local if present (values are never printed).
import fs from 'node:fs';
import { extractCall } from '../lib/analysis/llm';
import type { Lang, Utterance } from '../lib/types';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: npx tsx scripts/try-extract.ts <fixture.json>');
  const body = JSON.parse(fs.readFileSync(file, 'utf8')) as { utterances: Utterance[] };
  const isZh = body.utterances.some((u) => /\p{Script=Han}/u.test(u.text));
  const language: Lang = isZh ? 'zh' : 'en';
  const asksFirstCar = body.utterances.some((u) => u.speaker === 'agent' && /first car/i.test(u.text));

  const started = Date.now();
  const out = await extractCall(body.utterances, {
    preferredName: isZh ? '王奶奶' : 'Hal',
    language,
    askedQuestions: asksFirstCar ? [{ id: 'q-first-car', text: 'What was your first car?', askedBy: 'Sam' }] : [],
  });
  console.log(JSON.stringify(out, null, 2));
  console.error(`extractCall took ${Date.now() - started} ms (model: ${process.env.OPENAI_EXTRACT_MODEL || 'default'})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
