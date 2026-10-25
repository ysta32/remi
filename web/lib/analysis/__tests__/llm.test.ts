import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractCall, matchStories, setLlmTransportForTests, type LlmRequest } from '../llm';
import { buildExtractionSystemPrompt, formatTranscript } from '../prompts';
import type { Utterance } from '@/lib/types';

const utterances: Utterance[] = [
  { speaker: 'agent', text: 'Sam wanted to know: what was your first car?', startMs: 0, endMs: 2500 },
  { speaker: 'caller', text: 'Oh, um, a fifty-seven Bel Air. Three hundred bucks.', startMs: 3000, endMs: 7000 },
];
const ctx = {
  preferredName: 'Hal',
  language: 'en' as const,
  askedQuestions: [{ id: 'q-car', text: 'What was your first car?', askedBy: 'Sam' }],
};

const valid = {
  summary: 'Hal told Sam about his first car, a 1957 Chevy Bel Air he bought for $300.',
  funFacts: [
    { text: "Hal's first car was a 1957 Chevy Bel Air he bought for $300.", quote: 'a fifty-seven Bel Air. Three hundred bucks.', questionId: 'q-car' },
  ],
  topics: [{ kind: 'question', summary: 'First car: a 1957 Chevy Bel Air', initiatedBy: 'agent' }],
  mood: { label: 'positive', score: 0.6, evidence: ['laughed about the price of the car'] },
  familyQuestionAnswers: [{ questionId: 'q-car', answer: 'A 1957 Chevy Bel Air, bought for $300.' }],
  safetyMentioned: false,
};

afterEach(() => setLlmTransportForTests(null));

describe('extractCall', () => {
  it('returns a valid extraction on the first try', async () => {
    const t = vi.fn(async () => JSON.stringify(valid));
    setLlmTransportForTests(t);
    const out = await extractCall(utterances, ctx);
    expect(out).toEqual(valid);
    expect(t).toHaveBeenCalledTimes(1);
    const req = (t.mock.calls[0] as unknown as [LlmRequest])[0];
    expect(req.user).toContain('Caller: Oh, um, a fifty-seven Bel Air.');
    expect(req.system).toContain('id "q-car"');
    expect(req.schemaName).toBe('call_extraction');
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    const bad = { ...valid, mood: { ...valid.mood, score: 3 } };
    const t = vi
      .fn<(req: LlmRequest) => Promise<string>>()
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(valid));
    setLlmTransportForTests(t);
    const out = await extractCall(utterances, ctx);
    expect(out.mood.score).toBe(0.6);
    expect(t).toHaveBeenCalledTimes(2);
    const retryUser = t.mock.calls[1][0].user;
    expect(retryUser).toContain('mood.score');
    expect(retryUser).toContain('Transcript:');
  });

  it('treats non-JSON output as invalid and retries', async () => {
    const t = vi
      .fn<(req: LlmRequest) => Promise<string>>()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify(valid));
    setLlmTransportForTests(t);
    await expect(extractCall(utterances, ctx)).resolves.toEqual(valid);
    expect(t.mock.calls[1][0].user).toContain('not valid JSON');
  });

  it('throws when the output is invalid twice', async () => {
    const t = vi.fn(async () => JSON.stringify({ ...valid, summary: 'x'.repeat(901) }));
    setLlmTransportForTests(t);
    await expect(extractCall(utterances, ctx)).rejects.toThrow(/failed validation twice/);
    expect(t).toHaveBeenCalledTimes(2);
  });
});

describe('prompts', () => {
  it('formats Caller/Agent lines and skips empty text', () => {
    expect(
      formatTranscript([...utterances, { speaker: 'caller', text: '  ', startMs: 8000, endMs: 8100 }]),
    ).toBe('Agent: Sam wanted to know: what was your first car?\nCaller: Oh, um, a fifty-seven Bel Air. Three hundred bucks.');
  });

  it('includes the name, language and safety line', () => {
    const p = buildExtractionSystemPrompt({ preferredName: '王奶奶', language: 'zh', askedQuestions: [] });
    expect(p).toContain('王奶奶');
    expect(p).toContain('Mandarin Chinese');
    expect(p).toContain('Part of the call touched on a hard moment;');
    expect(p).toContain('empty familyQuestionAnswers');
  });
});

describe('matchStories', () => {
  it('maps matches and ignores unknown ids', async () => {
    setLlmTransportForTests(async () =>
      JSON.stringify({
        matches: [
          { newId: 'n1', matchId: 'c1' },
          { newId: 'n2', matchId: 'made-up' },
        ],
      }),
    );
    const out = await matchStories(
      [
        { id: 'n1', summary: 'The 1977 blizzard and the roundhouse roof' },
        { id: 'n2', summary: 'Fishing at Raystown Lake' },
      ],
      [{ id: 'c1', summary: 'Roundhouse roof caved in during the big 1977 snow' }],
    );
    expect(out).toEqual({ n1: 'c1', n2: null });
  });

  it('skips the model call when there are no candidates', async () => {
    const t = vi.fn(async () => '{}');
    setLlmTransportForTests(t);
    expect(await matchStories([{ id: 'n1', summary: 's' }], [])).toEqual({ n1: null });
    expect(t).not.toHaveBeenCalled();
  });
});
