import { importSyntheticTranscripts } from '../lib/server/synthetic-import';

const HELP = 'Usage: npm run import:synthetic -- --input <corpus-directory> [--database <fresh.sqlite>] [--apply]\nDry run by default. Apply requires an explicit fresh database under an existing nonsymlink parent. Run from web/. No credentials or network requests.';
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log(HELP); return; }
  let inputDir: string | undefined, databasePath: string | undefined, apply = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error('SYNTHETIC_IMPORT_OPTIONS_INVALID');
    seen.add(flag);
    if (flag === '--apply') apply = true;
    else if ((flag === '--input' || flag === '--database') && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (flag === '--input') inputDir = args[++i]; else databasePath = args[++i];
    } else throw new Error('SYNTHETIC_IMPORT_OPTIONS_INVALID');
  }
  if (!inputDir) throw new Error('SYNTHETIC_IMPORT_OPTIONS_INVALID');
  console.log(JSON.stringify(await importSyntheticTranscripts({ inputDir, databasePath, apply })));
}
main().catch(error => {
  const message = error instanceof Error && /^SYNTHETIC_[A-Z_]+$/.test(error.message) ? error.message : 'SYNTHETIC_IMPORT_FAILED';
  console.error(message); process.exitCode = 1;
});
