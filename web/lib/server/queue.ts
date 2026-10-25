// One in-process serial queue so two calls finishing together don't race on recomputeElder.
// Kept on globalThis so Next dev HMR shares a single chain.
const g = globalThis as unknown as { __remiQueue?: Promise<void> };

export function enqueue(job: () => Promise<void>): Promise<void> {
  const prev = g.__remiQueue ?? Promise.resolve();
  const next = prev.then(job).catch((err) => {
    console.error('[queue] job failed', err instanceof Error ? err.message : err);
  });
  g.__remiQueue = next;
  return next;
}

/**
 * Resolves when every queued job so far has finished (tests, dev tools), or after `timeoutMs`
 * so a hung model call can't block a demo reset forever.
 */
export function drainQueue(timeoutMs = 10_000): Promise<void> {
  const pending = g.__remiQueue ?? Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[queue] drain timed out after ${timeoutMs} ms; continuing`);
      resolve();
    }, timeoutMs);
  });
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
}
