import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SimulatedBadge } from '@/components/SimulatedBadge';
import { DriftIndexChart, DriftLegend } from '@/components/research/DriftIndexChart';
import { driftDomain, type WeekPoint } from '@/components/research/drift-domain';
import { SlowdownChart, type SlowCall } from '@/components/research/SlowdownChart';
import { DEFAULT_DRIFT_INDEX_OPTIONS } from '@/lib/analysis/drift-index';
import { TradeoffChart, type SweepPoint } from '@/components/research/TradeoffChart';
import { CorpusCharts, CorpusLegend, type CorpusRow } from '@/components/research/CorpusCharts';
import { APP_NAME } from '@/lib/config';
import evalData from '@/lib/research/drift-eval.json';
import corpus from '@/lib/research/corpus-eval.json';

// Regenerate the JSON with: npx tsx scripts/sim-personas.ts && npx tsx scripts/eval-synthetic.ts
export const metadata: Metadata = { title: `${APP_NAME}: noticing speech changes linked to cognitive decline` };

type RuleResult = {
  driftDetectionPct: number; driftDelayMedianWeeks: number; driftDelayIqr: string;
  stableAnyAlert8wPct: number; stableAlertsPerPersonaYear: number; moodCognitiveAlertPct: number;
};
type Realistic = {
  name: string; driftIndexDetectedPct: number; driftIndexDelayMedian: number; driftIndexDelayIqr: string;
  currentDetectedPct: number; currentDelayMedian: number;
};
const results = evalData.results as Record<'driftIndex' | 'current' | 'naive', RuleResult>;
const examples = evalData.examples as Record<'drift' | 'stable' | 'mood', WeekPoint[]>;
const realistic = evalData.realistic.scenarios as Realistic[];
const realisticExample = evalData.realistic.example as WeekPoint[];
type SlowResult = { caughtPct: number; callsMedian: number; daysMedian: number; weeklyRuleNudgedPct: number };
const slowdown = evalData.slowdown as {
  onsetDay: number; wpmDrop: number;
  variants: (SlowResult & { name: string; stableFlagsPerYear: number; moodFlagPct: number })[];
  sizes: (SlowResult & { wpm: number })[];
  example: { usual: { median: number; scale: number }; calls: SlowCall[] };
};

// Same card as the chat recap.
const card = 'rounded-3xl border border-line bg-card p-[22px] shadow-[0_2px_6px_rgba(29,43,69,0.04)]';
const h2 = 'text-[30px] font-black tracking-tight';
const lede = 'max-w-[75ch] text-ink-2';
const small = 'max-w-[75ch] text-base text-ink-2';
const pc = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
const n1 = (v: number) => v.toFixed(v < 1 ? 2 : 1).replace(/\.0+$/, '');

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={card}>
      <p className="text-[44px] font-black leading-none tracking-tight">{value}</p>
      <p className="mt-2 text-ink-2">{label}</p>
    </div>
  );
}

const PERSONAS: { key: 'drift' | 'stable' | 'mood' | 'slowdown'; title: string; who: string }[] = [
  { key: 'drift', title: 'Cognitive-decline pattern', who: 'Someone whose speech gradually shifts the way studies describe early cognitive decline: longer pauses, slower talking, more "um"s, and more retold stories.' },
  { key: 'stable', title: 'Steady', who: 'Someone who doesn’t change, apart from ordinary ups and downs and one week with a cold.' },
  { key: 'slowdown', title: 'Sudden slowdown', who: 'Someone whose talking suddenly becomes much slower (about 30 words a minute) and stays that way.' },
  { key: 'mood', title: 'Two low weeks', who: 'Someone who feels down for two weeks, talks a little slower, then recovers.' },
];

const RULES: { key: 'driftIndex' | 'current' | 'naive'; name: string; how: string }[] = [
  { key: 'naive', name: 'Alert on any unusual call', how: 'Any single chat with any marker 2 spreads from his usual' },
  { key: 'current', name: 'Our first rule', how: '2 or more kinds of markers above 1.5, two weeks in a row' },
  { key: 'driftIndex', name: `${APP_NAME}’s rule`, how: 'Weekly score ≥ 1.5 in 3 of the last 4 weeks, still rising, and mood not low' },
];

export default function ResearchPage() {
  const di = results.driftIndex;
  const cur = results.current;
  const fewer = Math.round(cur.stableAlertsPerPersonaYear / di.stableAlertsPerPersonaYear);
  const yearsPerNote = Math.round(1 / di.stableAlertsPerPersonaYear);
  const full = realistic[0];
  const half = realistic[1];
  const rows = corpus.rows as CorpusRow[];
  const corpusFirstNote = (corpus.driftIndex as WeekPoint[]).find((w) => w.nudge)?.week;
  const realisticNotes = realisticExample.filter((w) => w.nudge).map((w) => w.week);
  const sideDomain = driftDomain(examples.drift, examples.stable, examples.mood);
  const sharp = slowdown.variants[0];

  return (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto max-w-[1200px] space-y-12 px-4 pb-16 md:px-8">
        <header className="space-y-4">
          <Link href="/evaluation" className="inline-block rounded-full border border-ink/20 bg-card px-5 py-2 font-bold hover:bg-sky-soft">Repeat detector: view the human-reviewed evaluation →</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[34px] font-black leading-[1.05] tracking-tight [text-wrap:balance] md:text-[44px]">Noticing the speech changes linked to early cognitive decline</h1>
            <SimulatedBadge />
          </div>
          <p className={lede}>
            Research links early cognitive decline to gradual changes in everyday speech: longer and more frequent pauses,
            slower talking, more &quot;um&quot;s, and the same stories told again. We simulated people whose speech changes
            this way, and people whose speech doesn&apos;t, to see whether {APP_NAME} notices the pattern and tells the
            family, without worrying families when nothing has changed.
          </p>
        </header>

        <section aria-label="Headline results" className="grid gap-4 md:grid-cols-3">
          <Stat value={`${pc(full.driftIndexDetectedPct)}`} label={`of simulated cognitive-decline speech patterns were noticed within six months, typically ${full.driftIndexDelayMedian} weeks in`} />
          <Stat value={`1 in ${yearsPerNote} yrs`} label={`an unneeded note for a steady person, ${fewer}× fewer than our first rule`} />
          <Stat value={`${pc(di.moodCognitiveAlertPct)}`} label={`of low-mood weeks were mistaken for a change in talking (first rule: ${pc(cur.moodCognitiveAlertPct)})`} />
        </section>

        <section aria-labelledby="who" className="space-y-4">
          <h2 id="who" className={h2}>Who we simulated</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PERSONAS.map((p) => (
              <article key={p.key} className={card}>
                <h3 className="text-[22px] font-black">{p.title}</h3>
                <p className="mt-2 text-ink-2">{p.who}</p>
              </article>
            ))}
          </div>
          <p className={small}>Each person was simulated {evalData.seeds} times.</p>
        </section>

        <section aria-label="Results" className="space-y-4">
          <h2 className={h2}>Cognitive-decline pattern over six months</h2>
          <p className={lede}>
            The cognitive-decline pattern unfolding at a realistic pace (weeks 3–26). In this typical run the first family
            note comes in week {realisticNotes[0]}, about halfway through the change. While the change continues, reminders
            come no more than once every 4 weeks.
          </p>
          <div className={card}>
            <DriftIndexChart weeks={realisticExample} height={260} title="Six-month cognitive-decline pattern: weekly score" />
            <div className="mt-2"><DriftLegend /></div>
          </div>
          <div className={`${card} overflow-x-auto p-0 md:p-0`}>
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-base text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-bold">Change over six months</th>
                  <th className="px-4 py-3 text-right font-bold">{APP_NAME}&apos;s rule: noticed</th>
                  <th className="px-4 py-3 text-right font-bold">Typical weeks until note</th>
                  <th className="px-5 py-3 text-right font-bold">First rule: noticed / weeks</th>
                </tr>
              </thead>
              <tbody>
                {[{ r: full, label: 'Full size (as above)' }, { r: half, label: 'Half as large' }].map(({ r, label }) => (
                  <tr key={label} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-extrabold">{label}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{pc(r.driftIndexDetectedPct)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.driftIndexDelayMedian} <span className="text-ink-2">({r.driftIndexDelayIqr})</span></td>
                    <td className="px-5 py-3 text-right tabular-nums">{pc(r.currentDetectedPct)} / {r.currentDelayMedian}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={small}>
            The first rule speaks up a few weeks sooner, but, as below, it sends about {fewer}× more notes to families with
            nothing to worry about. Smaller changes take longer to notice, and some aren&apos;t noticed within six months.
          </p>

          <h2 className={`pt-8 ${h2}`}>A sudden slowdown in talking speed</h2>
          <p className={lede}>
            A big drop in pace shouldn&apos;t wait weeks for the weekly score. After every call, {APP_NAME} also checks
            talking speed on its own: if it is far below his usual on {DEFAULT_DRIFT_INDEX_OPTIONS.sharpCalls} chats in a
            row, the family gets a check-in right away. Requiring a few chats in a row keeps one tired or noisy call from
            setting it off.
          </p>
          <div className={card}>
            <SlowdownChart calls={slowdown.example.calls} usual={slowdown.example.usual} flagZ={DEFAULT_DRIFT_INDEX_OPTIONS.sharpZ}
              onsetDay={slowdown.onsetDay} />
          </div>
          <section aria-label="Sudden slowdown results" className="grid gap-4 md:grid-cols-3">
            <Stat value={pc(sharp.caughtPct)} label={`of ${slowdown.wpmDrop}-words-a-minute slowdowns caught, typically after ${sharp.callsMedian} chats (${sharp.daysMedian} days)`} />
            <Stat value={`1 in ${Math.round(1 / sharp.stableFlagsPerYear)} yrs`} label="an unneeded check-in for a steady person" />
            <Stat value={pc(sharp.moodFlagPct)} label="of low-mood fortnights set it off (they get the wellbeing card)" />
          </section>
          <div className={`${card} overflow-x-auto p-0 md:p-0`}>
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-base text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-bold">Size of slowdown</th>
                  <th className="px-4 py-3 text-right font-bold">Caught</th>
                  <th className="px-4 py-3 text-right font-bold">Typical chats until check-in</th>
                  <th className="px-5 py-3 text-right font-bold">Weekly score alone would have noticed</th>
                </tr>
              </thead>
              <tbody>
                {slowdown.sizes.map((s) => (
                  <tr key={s.wpm} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-extrabold">{s.wpm} words/min slower</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{pc(s.caughtPct)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.callsMedian} <span className="text-ink-2">({s.daysMedian} days)</span></td>
                    <td className="px-5 py-3 text-right tabular-nums">{pc(s.weeklyRuleNudgedPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={small}>
            The weekly score blends seven markers, so one marker changing on its own barely moves it; that&apos;s why the
            pace check runs separately. Readings are computed from each chat&apos;s transcript within about 30 seconds of
            hanging up.
          </p>

          <h2 className={`pt-8 ${h2}`}>Three people side by side (8 weeks, compressed)</h2>
          <DriftLegend />
          <div className="grid gap-4 lg:grid-cols-3">
            {PERSONAS.filter((p) => p.key !== 'slowdown').map((p) => {
              const weeks = examples[p.key as keyof typeof examples];
              const noted = weeks.find((w) => w.nudge);
              const wellbeing = weeks.find((w) => w.wellbeingCard);
              return (
                <article key={p.key} className={card}>
                  <h3 className="text-[22px] font-black">{p.title}</h3>
                  <div className="mt-3">
                    <DriftIndexChart weeks={weeks} height={210} domain={sideDomain} title={`${p.title}: weekly score`} />
                  </div>
                  <p className="mt-2 font-bold">
                    {noted
                      ? `Family note in week ${noted.week}`
                      : wellbeing
                        ? `No check-up note; wellbeing card from week ${wellbeing.week}`
                        : 'No note: stayed within his usual'}
                  </p>
                </article>
              );
            })}
          </div>

          <h2 className={`pt-8 ${h2}`}>Compared with simpler rules</h2>
          <div className={`${card} overflow-x-auto p-0 md:p-0`}>
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-base text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-bold">Rule</th>
                  <th className="px-4 py-3 text-right font-bold">Decline pattern noticed (8 wk)</th>
                  <th className="px-4 py-3 text-right font-bold">Unneeded notes / year</th>
                  <th className="px-5 py-3 text-right font-bold">Low mood mistaken for change</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((r) => {
                  const x = results[r.key];
                  return (
                    <tr key={r.key} className={`border-b border-line last:border-0 ${r.key === 'driftIndex' ? 'bg-sky-soft/50' : ''}`}>
                      <td className="px-5 py-3">
                        <p className="font-extrabold">{r.name}</p>
                        <p className="text-base text-ink-2">{r.how}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{pc(x.driftDetectionPct)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{n1(x.stableAlertsPerPersonaYear)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{pc(x.moodCognitiveAlertPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={small}>
            Unneeded notes are counted over full simulated years of the steady person. Alerting on single calls would
            message a healthy family more than once a week, which is why {APP_NAME} waits for weeks of evidence.
          </p>

          <h2 className={`pt-8 ${h2}`}>Every setting is a trade-off</h2>
          <div className={card}>
            <TradeoffChart sweep={evalData.sweep as SweepPoint[]} />
          </div>
          <p className={small}>
            Each dot is a variation of the rule (8-week runs). Up and to the left is better. A stricter line or a longer
            baseline sends fewer unneeded notes but notices less; &quot;2 of 4 weeks&quot; notices more but writes to a
            steady family almost once a year. Hover a dot for its numbers.
          </p>
        </section>

        <section aria-labelledby="generated" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="generated" className={h2}>Checked on generated conversations</h2>
            <SimulatedBadge />
          </div>
          <p className={lede}>
            Separately, a synthetic transcript generator wrote four weeks of chats for a fictional person, with pauses that
            get longer each week (about 600 → 1,400 ms) and stories retold two weeks later. We ran the real marker code on
            those transcripts.
          </p>
          <div className={card}>
            <CorpusCharts rows={rows} />
            <div className="mt-3"><CorpusLegend /></div>
          </div>
          <ul className="max-w-[75ch] list-disc space-y-2 pl-6">
            <li><strong>The marker code measured the planted pauses exactly.</strong> Pace barely moves and there are no fillers, because the generator only varies pauses.</li>
            <li><strong>{APP_NAME}&apos;s rule: {corpusFirstNote ? `note in week ${corpusFirstNote}` : 'no note'}</strong>, using a shortened setup for four weeks of data (week 1 as the baseline, 2 of 3 weeks).</li>
            <li><strong>It found a gap to fix:</strong> every retelling comes 14 days after the first, but the repeat counter looks back only 7 days, so it counted none.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
