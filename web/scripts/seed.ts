// STUB owned by workstream D: implements echo-docs/echo-docs/docs/demo.md §2.
// B wires `npm run seed -- --scenario drift|stable` and POST /api/dev/seed to runSeed().
//
// Contract for D's implementation:
// - Both callers reset the DB (resetAll) BEFORE runSeed, so runSeed only inserts.
// - Insert the demo elder with id DEMO_ELDER_ID so the agent's ELDER_ID survives re-seeding.
// - Set is_simulated=1 on the elder (nudges copy it) and on every seeded row.
// - Consent: fam_* = 1 and elder_* = 1 with elder_confirmed_call_id = call 1, or no nudge fires.
// - Calls status='done'; write call_markers rows directly (confidence 'high'), never baselines/z/nudges.
// - Then `await recomputeElder(DEMO_ELDER_ID)` from '@/lib/analysis/pipeline'.
// - A working reference seed for the drift/stable marker table is seedDemo() in
//   lib/analysis/__tests__/recompute.test.ts.
export type Scenario = 'drift' | 'stable';

/** Fixed demo elder id: put this in the agent's ELDER_ID. */
export const DEMO_ELDER_ID = 'elder-hal-demo';

export async function runSeed(scenario: Scenario): Promise<{ elderId: string }> {
  void scenario;
  throw new Error('seed not implemented yet (workstream D)');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed.ts')) {
  const i = process.argv.indexOf('--scenario');
  const scenario = (i > -1 ? process.argv[i + 1] : 'drift') as Scenario;
  (async () => {
    const { loadLocalEnv } = await import('../lib/server/env');
    loadLocalEnv();
    const { resetAll } = await import('../lib/server/dev');
    resetAll();
    return runSeed(scenario);
  })()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
