import { analyzeSyntheticAudio } from '../lib/analysis/synthetic-audio';
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log('Usage: npm run analyze:synthetic-audio -- --audio ABS_DIR --input ABS_DIR --output FRESH_ABS_DIR [--apply]\nDefault: offline validation only. Apply uses STT_PROVIDER=openai and OPENAI_API_KEY loaded explicitly by the caller.'); return; }
  const values: Record<string,string> = {}; let apply = false;
  for (let i=0;i<args.length;i++) {
    const flag=args[i];
    if (flag === '--apply' && !apply) apply=true;
    else if (['--audio','--input','--output'].includes(flag) && !values[flag] && args[i+1] && !args[i+1].startsWith('--')) values[flag]=args[++i];
    else throw new Error('SYNTHETIC_AUDIO_OPTIONS_INVALID');
  }
  if (!values['--audio'] || !values['--input'] || !values['--output']) throw new Error('SYNTHETIC_AUDIO_OPTIONS_INVALID');
  console.log(JSON.stringify(await analyzeSyntheticAudio({audioDir:values['--audio'],inputDir:values['--input'],outputDir:values['--output'],apply},{onProgress:event=>console.log(JSON.stringify(event))})));
}
main().catch(error => { console.error(error instanceof Error && /^SYNTHETIC_AUDIO_[A-Z_]+$/.test(error.message) ? error.message : 'SYNTHETIC_AUDIO_FAILED'); process.exitCode=1; });
