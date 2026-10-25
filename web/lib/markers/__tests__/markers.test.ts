import { describe, expect, it } from 'vitest';
import { computeMarkers, mattr } from '@/lib/markers';
import { countSubstrings, hanCount } from '@/lib/markers/tokenize';
import type { MarkerKey, MarkerResult, Utterance, Word } from '@/lib/types';

const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
const byKey = (rs: MarkerResult[]) => Object.fromEntries(rs.map((r) => [r.marker, r])) as Record<MarkerKey, MarkerResult>;

const TV2_WORDS: Word[] = [
  { w: 'hello', startMs: 0, endMs: 400 },
  { w: 'there', startMs: 450, endMs: 800 },
  { w: 'i', startMs: 1500, endMs: 1600 },
  { w: 'um', startMs: 1700, endMs: 1900 },
  { w: 'forgot', startMs: 3000, endMs: 3400 },
];
const tv2Caller = (words: Word[] = TV2_WORDS): Utterance => ({
  speaker: 'caller',
  text: 'hello there i um forgot',
  startMs: 0,
  endMs: 3400,
  words,
});

describe('computeMarkers', () => {
  it('returns every key except repeat_stories, in MARKER_KEYS order', () => {
    const rs = computeMarkers([], 'en');
    expect(rs.map((r) => r.marker)).toEqual([
      'speech_rate', 'pause_rate', 'mean_pause_ms', 'wfp_rate', 'filler_rate', 'vague_rate', 'mattr',
    ]);
  });

  it('TV1: English without word timestamps', () => {
    const m = byKey(
      computeMarkers(
        [{ speaker: 'caller', text: 'Um, I went to the store and, uh, bought the thing.', startMs: 0, endMs: 4400 }],
        'en',
      ),
    );
    expect(r2(m.filler_rate.value)).toBe(18.18);
    expect(r2(m.vague_rate.value)).toBe(9.09);
    expect(r2(m.speech_rate.value)).toBe(150);
    expect(m.speech_rate.confidence).toBe('low');
    expect(m.speech_rate.unit).toBe('wpm');
    expect(r2(m.mattr.value)).toBe(0.89);
    expect(m.mattr.confidence).toBe('low');
    for (const k of ['pause_rate', 'mean_pause_ms', 'wfp_rate'] as const) {
      expect(m[k]).toMatchObject({ value: null, confidence: 'na' });
    }
    for (const r of Object.values(m)) expect(['low', 'na']).toContain(r.confidence);
  });

  it('TV2: English with words', () => {
    const m = byKey(computeMarkers([tv2Caller()], 'en'));
    expect(r2(m.pause_rate.value)).toBe(40);
    expect(r2(m.mean_pause_ms.value)).toBe(900);
    expect(r2(m.wfp_rate.value)).toBe(20);
    expect(r2(m.speech_rate.value)).toBe(88.24);
    expect(r2(m.filler_rate.value)).toBe(20);
    expect(m.pause_rate.unit).toBe('per100w');
    expect(m.mean_pause_ms.unit).toBe('ms');
    expect(m.speech_rate.confidence).toBe('low'); // U < 100
  });

  it('TV2b: agent overlap excludes a gap', () => {
    const m = byKey(computeMarkers([tv2Caller(), { speaker: 'agent', text: 'mm-hmm', startMs: 2000, endMs: 2800 }], 'en'));
    expect(r2(m.pause_rate.value)).toBe(20);
    expect(r2(m.mean_pause_ms.value)).toBe(700);
    expect(r2(m.wfp_rate.value)).toBe(0);
  });

  it('words out of order give the same result as sorted words', () => {
    const shuffled = [TV2_WORDS[3], TV2_WORDS[0], TV2_WORDS[4], TV2_WORDS[2], TV2_WORDS[1]];
    expect(computeMarkers([tv2Caller(shuffled)], 'en')).toEqual(computeMarkers([tv2Caller()], 'en'));
  });

  it('words split across utterances are one stream sorted by startMs', () => {
    const a: Utterance = { speaker: 'caller', text: 'i um forgot', startMs: 1500, endMs: 3400, words: TV2_WORDS.slice(2) };
    const b: Utterance = { speaker: 'caller', text: 'hello there', startMs: 0, endMs: 800, words: TV2_WORDS.slice(0, 2) };
    const m = byKey(computeMarkers([a, b], 'en'));
    expect(r2(m.pause_rate.value)).toBe(40);
    expect(r2(m.wfp_rate.value)).toBe(20);
  });

  it('TV3: Mandarin text only', () => {
    const text = '我那个，嗯，想不起来那个东西了';
    expect(hanCount(text)).toBe(13);
    const m = byKey(computeMarkers([{ speaker: 'caller', text, startMs: 0, endMs: 5000 }], 'zh'));
    expect(r2(m.filler_rate.value)).toBe(7.69);
    expect(r2(m.vague_rate.value)).toBe(23.08);
    expect(m.filler_rate.unit).toBe('per100c');
    expect(m.speech_rate.unit).toBe('cpm');
    expect(m.filler_rate.confidence).toBe('low');
  });

  it('TV4: MATTR window', () => {
    const text = Array.from({ length: 30 }, () => 'the cat').join(' ');
    const m = byKey(computeMarkers([{ speaker: 'caller', text, startMs: 0, endMs: 20000 }], 'en'));
    expect(r2(m.mattr.value)).toBe(0.04);
    expect(m.mattr.confidence).toBe('low'); // U = 60 < 100
    expect(mattr(text.split(' ')).confidence).toBe('high');
  });

  it('empty transcript: everything null/na', () => {
    for (const r of computeMarkers([], 'en')) expect(r).toMatchObject({ value: null, confidence: 'na' });
  });

  it('caller says nothing (agent only): everything null/na', () => {
    const rs = computeMarkers(
      [
        { speaker: 'agent', text: 'Hi Hal, how are you today?', startMs: 0, endMs: 2000 },
        { speaker: 'caller', text: '', startMs: 2500, endMs: 2600 },
      ],
      'en',
    );
    for (const r of rs) expect(r).toMatchObject({ value: null, confidence: 'na' });
  });

  it('"you know" counts as one filler and is excluded from MATTR', () => {
    const m = byKey(computeMarkers([{ speaker: 'caller', text: 'It was, you know, cold', startMs: 0, endMs: 2000 }], 'en'));
    expect(r2(m.filler_rate.value)).toBe(20); // 1 filler / 5 words
    expect(r2(m.mattr.value)).toBe(1); // it, was, cold
  });

  it('zero pauses: mean_pause_ms is null/low', () => {
    const words: Word[] = [
      { w: 'hello', startMs: 0, endMs: 400 },
      { w: 'there', startMs: 450, endMs: 800 },
    ];
    const m = byKey(computeMarkers([{ speaker: 'caller', text: 'hello there', startMs: 0, endMs: 800, words }], 'en'));
    expect(m.mean_pause_ms).toMatchObject({ value: null, confidence: 'low' });
    expect(m.pause_rate.value).toBe(0);
  });

  it('gaps over PAUSE_MAX_MS are conversational silence, not pauses', () => {
    const words: Word[] = [
      { w: 'hello', startMs: 0, endMs: 400 },
      { w: 'there', startMs: 6000, endMs: 6400 },
    ];
    const m = byKey(computeMarkers([{ speaker: 'caller', text: 'hello there', startMs: 0, endMs: 6400, words }], 'en'));
    expect(m.pause_rate.value).toBe(0);
  });

  it('adequate English call (>= 100 words) gets high confidence', () => {
    const vocab = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike'.split(' ');
    const tokens = Array.from({ length: 120 }, (_, i) => vocab[i % vocab.length]);
    const words: Word[] = tokens.map((w, i) => ({ w, startMs: i * 500, endMs: i * 500 + 300 }));
    const m = byKey(computeMarkers([{ speaker: 'caller', text: tokens.join(' '), startMs: 0, endMs: 60000, words }], 'en'));
    expect(m.speech_rate.confidence).toBe('high');
    expect(m.mattr.confidence).toBe('high');
    expect(m.filler_rate).toMatchObject({ value: 0, confidence: 'high' });
    expect(m.mean_pause_ms).toMatchObject({ value: null, confidence: 'low' }); // 200 ms gaps are not pauses
  });

  it('zh MATTR uses word tokens and excludes fillers', () => {
    const m = byKey(computeMarkers([{ speaker: 'caller', text: '嗯，我喜欢猫，我喜欢狗。', startMs: 0, endMs: 3000 }], 'zh'));
    expect(m.mattr.confidence).toBe('low');
    expect(m.mattr.value).not.toBeNull();
    expect(m.mattr.value!).toBeGreaterThan(0);
    expect(m.mattr.value!).toBeLessThan(1); // 我 and 喜欢 repeat
    const withoutFiller = byKey(computeMarkers([{ speaker: 'caller', text: '我喜欢猫，我喜欢狗。', startMs: 0, endMs: 3000 }], 'zh'));
    expect(withoutFiller.mattr.value).toBe(m.mattr.value);
  });

  it('zh substring counts are non-overlapping', () => {
    expect(countSubstrings('那个那个东西', ['那个', '东西'])).toBe(3);
    expect(countSubstrings('嗯嗯', ['嗯'])).toBe(2);
  });
});
