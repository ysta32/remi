// Sign-in for the control panel: the cookie holds sha-256(CONTROL_PASSCODE), which proxy.ts checks.
import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

export const CONTROL_COOKIE = 'remi_control';
export const controlToken = (passcode: string) => createHash('sha256').update(passcode).digest('hex');

export function passcodeMatches(given: string): boolean {
  const expected = config.controlPasscode;
  if (!expected) return false;
  const a = Buffer.from(controlToken(given));
  const b = Buffer.from(controlToken(expected));
  return timingSafeEqual(a, b);
}

// A few wrong guesses per minute, per client address.
const store = globalThis as unknown as { __remiLoginTries?: Map<string, number[]> };
export function tooManyTries(client: string, now = Date.now()): boolean {
  const tries = (store.__remiLoginTries ??= new Map<string, number[]>());
  const recent = (tries.get(client) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  tries.set(client, recent);
  return recent.length > 8;
}
