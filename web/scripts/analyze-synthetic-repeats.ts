import { analyzeSyntheticRepeats } from '../lib/server/synthetic-repeats';

const HELP = 'Usage: npm run analyze:synthetic -- --input ABSOLUTE_CORPUS --database ABSOLUTE_EXISTING_DB [--apply]\nDry run by default: validates without network, credentials, migrations or writes. Apply analyzes the complete fictional corpus with the standalone detector. Run from web/. Load credentials explicitly with Node --env-file. Settings: OPENAI_EXTRACT_MODEL, OPENAI_EMBED_MODEL, EMBEDDING_DIMENSIONS, OPENAI_TIMEOUT_MS (default120000), OPENAI_MAX_RETRIES, REPEAT_THRESHOLD (default0.85).';
const invalid = () => new Error('SYNTHETIC_REPEATS_OPTIONS_INVALID');
function numberOption(name: string, fallback: number, integer: boolean, min: number, max: number, aliases: string[] = []): number {
  const raw = [name, ...aliases].map(key => process.env[key]).find(value => value !== undefined);
  if (raw === undefined) return fallback;
  if (!raw.trim()) throw invalid();
  const value = Number(raw);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) throw invalid();
  return value;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log(HELP); return; }
  let inputDir: string | undefined, databasePath: string | undefined, apply = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw invalid();
    seen.add(flag);
    if (flag === '--apply') apply = true;
    else if ((flag === '--input' || flag === '--database') && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (flag === '--input') inputDir = args[++i]; else databasePath = args[++i];
    } else throw invalid();
  }
  if (!inputDir || !databasePath) throw invalid();
  const result = await analyzeSyntheticRepeats({ inputDir, databasePath, apply }, {
    apiKey: process.env.OPENAI_API_KEY,
    extractionModel: process.env.OPENAI_EXTRACT_MODEL ?? process.env.OPENAI_EXTRACTION_MODEL,
    embeddingModel: process.env.OPENAI_EMBED_MODEL ?? process.env.EMBEDDING_MODEL ?? process.env.OPENAI_EMBEDDING_MODEL,
    embeddingDimensions: numberOption('EMBEDDING_DIMENSIONS', 1536, true, 1, 65536, ['OPENAI_EMBEDDING_DIMENSIONS']),
    timeoutMs: numberOption('OPENAI_TIMEOUT_MS', 120000, true, 1, 120000),
    maxRetries: numberOption('OPENAI_MAX_RETRIES', 1, true, 0, 1),
    threshold: numberOption('REPEAT_THRESHOLD', 0.85, false, 0, 1),
    onProgress: event => console.log(JSON.stringify({ event: 'call_analyzed', ...event })),
  });
  console.log(JSON.stringify(result));
}
main().catch(error => {
  const message = error instanceof Error && /^SYNTHETIC_REPEATS_[A-Z_]+$/.test(error.message) ? error.message : 'SYNTHETIC_REPEATS_FAILED';
  console.error(message); process.exitCode = 1;
});
