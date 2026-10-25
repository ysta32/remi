import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('demo navigation', () => {
  it('preserves the existing demo elder when no override is supplied', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_ELDER_ID', undefined);
    vi.resetModules();
    const demo = await import('../demo');
    expect(demo.DEMO_ELDER_ID).toBe('elder-hal-demo');
    expect(demo.DEMO_ELDER_PATH).toBe('/elders/elder-hal-demo');
  });

  it('links to the selected imported elder', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_ELDER_ID', 'elder-synthetic-hal-bennett');
    vi.resetModules();
    const demo = await import('../demo');
    expect(demo.DEMO_ELDER_ID).toBe('elder-synthetic-hal-bennett');
    expect(demo.DEMO_ELDER_PATH).toBe('/elders/elder-synthetic-hal-bennett');
  });

  it('encodes the override as a single path segment', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_ELDER_ID', 'elder/with ?#%');
    vi.resetModules();
    const demo = await import('../demo');
    expect(demo.DEMO_ELDER_PATH).toBe('/elders/elder%2Fwith%20%3F%23%25');
  });
});
