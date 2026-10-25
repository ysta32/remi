// In-memory per-call pipeline step timings for /api/dev/status (no schema change).
// Kept on globalThis so Next dev HMR and route handlers share one map.
export interface StepTiming {
  step: string;
  ms: number;
  ok: boolean;
  error?: string; // message only, never transcript text
}

export interface CallTimings {
  callId: string;
  startedAt: string;
  steps: StepTiming[];
}

const MAX_CALLS = 50;
const g = globalThis as unknown as { __remiTimings?: Map<string, CallTimings> };
const store = (): Map<string, CallTimings> => (g.__remiTimings ??= new Map());

export function startTimings(callId: string): void {
  const m = store();
  m.delete(callId);
  m.set(callId, { callId, startedAt: new Date().toISOString(), steps: [] });
  while (m.size > MAX_CALLS) m.delete(m.keys().next().value as string);
}

export function recordStep(callId: string, timing: StepTiming): void {
  store().get(callId)?.steps.push(timing);
}

export function getTimings(callId: string): CallTimings | null {
  return store().get(callId) ?? null;
}
