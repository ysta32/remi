import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
import os from 'node:os';
import path from 'node:path';
import { analyzeSyntheticAudio, validateMeasuredWords, validateAudioTiming } from '../synthetic-audio';
const root = path.resolve('..');
describe('existing synthetic audio', () => {
  it('dry runs without STT or writes', async () => {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'audio-measure-')));
    const outputDir = path.join(parent, 'fresh'); const stt = vi.fn();
    const result = await analyzeSyntheticAudio({ inputDir: path.join(root,'synthetic/output-release'), audioDir: path.join(root,'synthetic/audio-openai-all'), outputDir }, { stt });
    expect(result.dryRun).toBe(true); expect(result.callCount).toBe(12);
    expect(stt).not.toHaveBeenCalled(); expect(fs.existsSync(outputDir)).toBe(false);
    await expect(analyzeSyntheticAudio({ inputDir: path.join(root,'synthetic/output-release'), audioDir: path.join(root,'synthetic/audio-openai-all'), outputDir: parent })).rejects.toThrow();
    fs.rmSync(parent, { recursive: true });
  });
  it('applies measured words only, caller spans and independent pitch confidence without changing sources', async () => {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'audio-measure-')));
    const outputDir = path.join(parent,'fresh');
    const audioDir = path.join(root,'synthetic/audio-openai-all');
    const before = fs.readFileSync(path.join(audioDir,'manifest.json'));
    const sourceFile=path.join(root,'synthetic/output-release/manifest.json');
    const sourceBefore=fs.readFileSync(sourceFile);
    const wavFile=path.join(audioDir,JSON.parse(before.toString()).calls[0].callerPath);
    const wavBefore=digest(fs.readFileSync(wavFile));
    const pitch = vi.fn(async () => [{marker:'pitch_var' as const,value:2,unit:'semitones',confidence:'low' as const}]);
    const stt = vi.fn(async (filename: string) => {
      const timing = JSON.parse(fs.readFileSync(path.join(audioDir,'timing',path.basename(filename,'.wav')+'.json'),'utf8'));
      const u = timing.utterances.find((u: {speaker:string}) => u.speaker === 'caller');
      return [{w:'measured',startMs:u.startMs+10,endMs:u.startMs+100}];
    });
    await analyzeSyntheticAudio({inputDir:path.join(root,'synthetic/output-release'),audioDir,outputDir,apply:true},{stt,pitch});
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir,'manifest.json'),'utf8'));
    expect(manifest.provider).toBe('injected'); expect(manifest.model).toBe('unknown'); expect(manifest.pitchProvider).toBe('injected');
    expect(fs.readFileSync(sourceFile)).toEqual(sourceBefore); expect(digest(fs.readFileSync(wavFile))).toEqual(wavBefore);
    const result = JSON.parse(fs.readFileSync(path.join(outputDir,manifest.results[0].callId+'.json'),'utf8'));
    expect(result.status).toBe('incomplete_coverage'); expect(result.lexicalSource).toBe('stt_only');
    expect(result.utterances.every((u: {text:string}) => u.text === '' || u.text === 'measured')).toBe(true);
    expect(result.pitchMarkers[0].confidence).toBe('low'); expect(result.textMarkers.some((m: {confidence:string}) => m.confidence === 'high')).toBe(false);
    expect(pitch.mock.calls).toHaveLength(12); expect(fs.readFileSync(path.join(audioDir,'manifest.json'))).toEqual(before);
    fs.rmSync(parent,{recursive:true});
  });
  it('leaves no successful manifest on provider failure', async () => {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'audio-measure-')));
    const outputDir = path.join(parent,'fresh');
    await expect(analyzeSyntheticAudio({inputDir:path.join(root,'synthetic/output-release'),audioDir:path.join(root,'synthetic/audio-openai-all'),outputDir,apply:true},{stt:async()=>{throw new Error('provider failed');}})).rejects.toThrow();
    expect(fs.existsSync(path.join(outputDir,'manifest.json'))).toBe(false);
    fs.rmSync(parent,{recursive:true});
  });
  it('rejects invalid source hashes and unsafe artifact paths before STT', async () => {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'audio-measure-')));
    const audioDir = path.join(parent,'audio'); fs.mkdirSync(audioDir);
    const manifest = JSON.parse(fs.readFileSync(path.join(root,'synthetic/audio-openai-all/manifest.json'),'utf8'));
    manifest.files = {'README.txt':'0'.repeat(64)};
    fs.writeFileSync(path.join(audioDir,'README.txt'),'changed');
    fs.writeFileSync(path.join(audioDir,'manifest.json'),JSON.stringify(manifest));
    const input = {inputDir:path.join(root,'synthetic/output-release'),audioDir,outputDir:path.join(parent,'fresh')}; const stt=vi.fn();
    await expect(analyzeSyntheticAudio(input,{stt})).rejects.toThrow('HASH_MISMATCH');
    manifest.files={'../escape':'0'.repeat(64)};
    fs.writeFileSync(path.join(audioDir,'manifest.json'),JSON.stringify(manifest));
    await expect(analyzeSyntheticAudio(input,{stt})).rejects.toThrow('PATH_UNSAFE');
    manifest.sourceManifestSha256='0'.repeat(64);
    fs.writeFileSync(path.join(audioDir,'manifest.json'),JSON.stringify(manifest));
    await expect(analyzeSyntheticAudio(input,{stt})).rejects.toThrow('SOURCE_INVALID');
    expect(stt).not.toHaveBeenCalled(); expect(fs.existsSync(input.outputDir)).toBe(false);
    fs.rmSync(parent,{recursive:true});
  });
  it('accepts nonnegative zero-duration boundary timestamps', () => {
    expect(validateMeasuredWords([{w:'yes',startMs:100,endMs:100}],100)).toHaveLength(1);
  });
  it('rejects symlink audio manifests before reading them', async () => {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'audio-measure-')));
    const audioDir=path.join(parent,'audio'); fs.mkdirSync(audioDir);
    fs.symlinkSync(path.join(root,'synthetic/audio-openai-all/manifest.json'),path.join(audioDir,'manifest.json'));
    await expect(analyzeSyntheticAudio({inputDir:path.join(root,'synthetic/output-release'),audioDir,outputDir:path.join(parent,'fresh')})).rejects.toThrow('PATH_UNSAFE');
    fs.rmSync(parent,{recursive:true});
  });
  it('validates canonical speaker identity and segment-derived boundaries', () => {
    const turns=[{speaker:'caller' as const,text:'canonical',startMs:0,endMs:20}];
    const timing={sampleRate:1000,totalSamples:100,utterances:[{speaker:'caller' as const,text:'canonical',startMs:10,endMs:30}],segments:[{index:0,turnIndex:0,startSample:10,endSample:30}]};
    expect(()=>validateAudioTiming(timing,turns,1000,100)).not.toThrow();
    for (const altered of [
      {...timing,utterances:[{...timing.utterances[0],speaker:'agent' as const}]},
      {...timing,utterances:[{...timing.utterances[0],startMs:-1}]},
      {...timing,utterances:[{...timing.utterances[0],endMs:31}]},
      {...timing,segments:[{...timing.segments[0],turnIndex:1}]},
    ]) expect(()=>validateAudioTiming(altered,turns,1000,100)).toThrow();
  });
  it.each([null, [], [{w:'x', startMs:NaN,endMs:4}], [{w:'x',startMs:5,endMs:4}], [{w:'x',startMs:0,endMs:101}], [{w:'',startMs:0,endMs:1}]])('rejects missing or invalid measured words %j', words => {
    expect(() => validateMeasuredWords(words, 100)).toThrow();
  });
  it('accepts real ordered times', () => expect(validateMeasuredWords([{w:'hello',startMs:1,endMs:30}],100)).toHaveLength(1));
});
