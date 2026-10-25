import { afterEach, describe, expect, it, vi } from 'vitest';
import { FILLER_PROMPTS, setSttTransportForTests, toWords, transcribeWords } from '../stt';

afterEach(() => {
  setSttTransportForTests(null);
  vi.unstubAllEnvs();
});

describe('transcribeWords', () => {
  it('returns null when STT_PROVIDER=none', async () => {
    vi.stubEnv('STT_PROVIDER', 'none');
    expect(await transcribeWords('/does/not/exist.wav', 'en')).toBeNull();
  });

  it('throws for the unconfigured deepgram provider', async () => {
    vi.stubEnv('STT_PROVIDER', 'deepgram');
    await expect(transcribeWords('/x.wav', 'en')).rejects.toThrow('deepgram provider not configured');
  });

  it('converts provider seconds to ms words and passes a filler prompt', async () => {
    const t = vi.fn(async () => [
      { word: 'Um', start: 0.5, end: 0.72 },
      { word: ' ', start: 0.72, end: 0.72 },
      { word: 'Bel', start: 1.0004, end: 1.3 },
    ]);
    setSttTransportForTests(t);
    const words = await transcribeWords('/tmp/call.wav', 'zh');
    expect(words).toEqual([
      { w: 'Um', startMs: 500, endMs: 720 },
      { w: 'Bel', startMs: 1000, endMs: 1300 },
    ]);
    expect(t).toHaveBeenCalledWith({ wavPath: '/tmp/call.wav', lang: 'zh', prompt: FILLER_PROMPTS.zh });
  });
});

describe('toWords', () => {
  it('never returns endMs before startMs', () => {
    expect(toWords([{ word: 'uh', start: 2, end: 1.9 }])).toEqual([{ w: 'uh', startMs: 2000, endMs: 2000 }]);
  });
});
