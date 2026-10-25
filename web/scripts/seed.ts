// STUB owned by workstream D: implements echo-docs/echo-docs/docs/demo.md §2.
// B wires `npm run seed -- --scenario drift|stable` and POST /api/dev/seed to runSeed().
export type Scenario = 'drift' | 'stable';

export async function runSeed(scenario: Scenario): Promise<{ elderId: string }> {
  void scenario;
  throw new Error('seed not implemented yet (workstream D)');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed.ts')) {
  const i = process.argv.indexOf('--scenario');
  const scenario = (i > -1 ? process.argv[i + 1] : 'drift') as Scenario;
  runSeed(scenario)
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
