import { afterEach, describe, expect, it } from 'vitest';
import { controlToken, passcodeMatches, tooManyTries } from '../control-auth';

describe('control panel sign-in', () => {
  afterEach(() => { delete process.env.CONTROL_PASSCODE; });

  it('is closed when no passcode is set', () => {
    expect(passcodeMatches('')).toBe(false);
    expect(passcodeMatches('anything')).toBe(false);
  });

  it('accepts only the exact passcode', () => {
    process.env.CONTROL_PASSCODE = 'cedar-maple-41';
    expect(passcodeMatches('cedar-maple-41')).toBe(true);
    expect(passcodeMatches('cedar-maple-42')).toBe(false);
    expect(controlToken('cedar-maple-41')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('slows down repeated guesses from one address', () => {
    const t0 = 1_000_000;
    const results = Array.from({ length: 10 }, (_, i) => tooManyTries('test-client', t0 + i));
    expect(results.slice(0, 8).every((r) => !r)).toBe(true);
    expect(results[9]).toBe(true);
    expect(tooManyTries('test-client', t0 + 120_000)).toBe(false);
  });
});
