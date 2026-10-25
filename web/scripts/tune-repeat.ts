// Embeds fixtures/transcripts/repeat-pairs.json with the real provider, prints the cosine per
// pair and a suggested REPEAT_COSINE. Run from web/: npx tsx scripts/tune-repeat.ts
// Reads OPENAI_API_KEY etc. from web/.env.local if present (values are never printed).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cosine, embed } from '../lib/analysis/embeddings';
import { REPEAT_COSINE } from '../lib/analysis/config';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');

interface Pair { a: string; b: string; same: boolean }

async function main() {
  const file = fileURLToPath(new URL('../../fixtures/transcripts/repeat-pairs.json', import.meta.url));
  const pairs = JSON.parse(fs.readFileSync(file, 'utf8')) as Pair[];
  const vectors = await embed(pairs.flatMap((p) => [p.a, p.b]));
  const scored = pairs.map((p, i) => ({ ...p, sim: cosine(vectors[2 * i], vectors[2 * i + 1]) }));

  console.log(`model: ${process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small (default)'}`);
  for (const s of scored) {
    console.log(`${s.sim.toFixed(4)}  ${s.same ? 'SAME' : 'diff'}  ${s.a}  <->  ${s.b}`);
  }

  const same = scored.filter((s) => s.same).map((s) => s.sim);
  const diff = scored.filter((s) => !s.same).map((s) => s.sim);
  const minSame = Math.min(...same);
  const maxDiff = Math.max(...diff);
  console.log(`\nmin SAME = ${minSame.toFixed(4)}, max diff = ${maxDiff.toFixed(4)}`);

  const accuracy = (t: number) => scored.filter((s) => (s.sim >= t) === s.same).length;
  let suggested: number;
  if (minSame > maxDiff) {
    suggested = (minSame + maxDiff) / 2;
    console.log('Pairs are separable; suggesting the midpoint.');
  } else {
    // Not separable: pick the candidate threshold with the best accuracy, preferring higher (fewer false repeats).
    const cands = [...new Set(scored.map((s) => s.sim))].sort((x, y) => y - x);
    suggested = cands.reduce((best, t) => (accuracy(t) > accuracy(best) ? t : best), cands[0]);
    console.log('Pairs overlap; suggesting the most accurate observed threshold.');
  }
  console.log(`suggested REPEAT_COSINE ≈ ${suggested.toFixed(2)} (${accuracy(suggested)}/${scored.length} correct)`);
  console.log(`current REPEAT_COSINE = ${REPEAT_COSINE} (${accuracy(REPEAT_COSINE)}/${scored.length} correct)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
