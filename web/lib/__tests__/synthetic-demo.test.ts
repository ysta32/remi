import { describe, expect, it } from 'vitest';
import { isSyntheticTranscriptDemo, SYNTHETIC_TRANSCRIPT_NOTICE } from '../synthetic-demo';

const imported = { about: `${SYNTHETIC_TRANSCRIPT_NOTICE}\n\nFictional biography.` };

describe('transcript demo provenance', () => {
  it('recognizes the exact imported notice with all simulated calls', () => {
    expect(isSyntheticTranscriptDemo(imported, [{ isSimulated: true }, { isSimulated: true }])).toBe(true);
  });

  it('does not describe other simulated demo histories as authored transcript timing', () => {
    expect(isSyntheticTranscriptDemo({ about: 'Other simulated demo.' }, [{ isSimulated: true }])).toBe(false);
    expect(isSyntheticTranscriptDemo({ about: `Biography mentions ${SYNTHETIC_TRANSCRIPT_NOTICE}\n\n` }, [{ isSimulated: true }])).toBe(false);
    expect(isSyntheticTranscriptDemo({ about: `${SYNTHETIC_TRANSCRIPT_NOTICE} Biography` }, [{ isSimulated: true }])).toBe(false);
  });

  it('requires a loaded profile and nonempty entirely simulated calls', () => {
    expect(isSyntheticTranscriptDemo(null, [{ isSimulated: true }])).toBe(false);
    expect(isSyntheticTranscriptDemo(imported, [])).toBe(false);
    expect(isSyntheticTranscriptDemo(imported, [{ isSimulated: false }])).toBe(false);
    expect(isSyntheticTranscriptDemo(imported, [{ isSimulated: true }, { isSimulated: false }])).toBe(false);
  });
});
