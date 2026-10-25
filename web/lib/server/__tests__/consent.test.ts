import { describe, expect, it } from 'vitest';
import { consentView, effectiveConsent, elderConfirmed, type ConsentRow } from '../consent';

const row = (fam: number, elder: number | null): ConsentRow => ({
  fam_summaries: fam,
  fam_fun_facts: fam,
  fam_speech_trends: fam,
  fam_mood: fam,
  elder_summaries: elder,
  elder_fun_facts: elder,
  elder_speech_trends: elder,
  elder_mood: elder,
});

describe('effectiveConsent truth table', () => {
  const cases: [number, number | null, boolean][] = [
    [0, null, false],
    [0, 0, false],
    [0, 1, false],
    [1, null, false],
    [1, 0, false],
    [1, 1, true],
  ];
  it.each(cases)('proposed=%s elder=%s → %s', (fam, elder, expected) => {
    const eff = effectiveConsent(row(fam, elder));
    expect(Object.values(eff)).toEqual([expected, expected, expected, expected]);
  });

  it('missing row → all false, unconfirmed', () => {
    expect(consentView(undefined)).toEqual({
      proposed: { summaries: false, funFacts: false, speechTrends: false, mood: false },
      elderConfirmed: false,
      effective: { summaries: false, funFacts: false, speechTrends: false, mood: false },
    });
  });

  it('mixed per-key values', () => {
    const r: ConsentRow = { ...row(1, 1), fam_mood: 0, elder_fun_facts: 0, elder_speech_trends: null };
    expect(effectiveConsent(r)).toEqual({ summaries: true, funFacts: false, speechTrends: false, mood: false });
    expect(elderConfirmed(r)).toBe(false);
  });

  it('elderConfirmed when all four elder columns are non-NULL, even if 0', () => {
    expect(elderConfirmed(row(1, 0))).toBe(true);
    expect(elderConfirmed(row(1, null))).toBe(false);
  });
});
