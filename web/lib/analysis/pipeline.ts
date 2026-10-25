// STUB until workstream C lands the real pipeline (contracts §7). Marks the call done.
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { calls } from '@/db/schema';

export async function processCall(callId: string): Promise<void> {
  try {
    getDb().update(calls).set({ status: 'done' }).where(eq(calls.id, callId)).run();
  } catch (err) {
    console.error('[pipeline] stub failed', err instanceof Error ? err.message : err);
  }
}

export async function recomputeElder(elderId: string): Promise<void> {
  void elderId;
}
