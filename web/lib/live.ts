// Decisions shared by the pollers on Hal's page and the home "Today" row.

const POLL_BUSY_MS = 3_000;
const POLL_IDLE_MS = 15_000;

// One request failing (e.g. the elder profile) must not throw away the other's good data.
export function settled<T>(result: PromiseSettledResult<T>, previous: T): T {
  return result.status === 'fulfilled' ? result.value : previous;
}

// Poll every 3 s while a call is being written up, otherwise every 15 s (SPEC §13).
// Callers pass the last known `processing`, so a failed poll mid-call still retries fast.
export function pollDelay(processing: boolean): number {
  return processing ? POLL_BUSY_MS : POLL_IDLE_MS;
}

// Keys are call ids suffixed with their status ("c1|done") plus fun-fact ids. Returns the ids
// that are new since the last poll; the first load (no previous keys) reports nothing.
export function freshIds(previous: Set<string> | null, keys: string[]): string[] {
  if (!previous) return [];
  return keys.filter((k) => !previous.has(k)).map((k) => k.split('|')[0]);
}
