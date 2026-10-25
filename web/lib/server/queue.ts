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

/** Resolves when every queued job so far has finished (tests, dev tools). */
export function drainQueue(): Promise<void> {
  return g.__remiQueue ?? Promise.resolve();
}
