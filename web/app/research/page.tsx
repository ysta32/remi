import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SimulatedBadge } from '@/components/SimulatedBadge';
import { DriftIndexChart, DriftLegend, type WeekPoint } from '@/components/research/DriftIndexChart';
import { TradeoffChart, type SweepPoint } from '@/components/research/TradeoffChart';
import { CorpusCharts, CorpusLegend, type CorpusRow } from '@/components/research/CorpusCharts';
import { APP_NAME } from '@/lib/config';
import evalData from '@/lib/research/drift-eval.json';
import corpus from '@/lib/research/corpus-eval.json';

// Regenerate the JSON with: npx tsx scripts/sim-personas.ts && npx tsx scripts/eval-synthetic.ts
export const metadata: Metadata = { title: `How ${APP_NAME} notices slow changes` };

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

const card = 'rounded-[28px] border border-line bg-card p-5 md:p-6';
const h2 = 'text-[30px] font-black tracking-tight';
const lede = 'max-w-[75ch] text-ink-2';
const small = 'max-w-[75ch] text-base text-ink-2';
const pc = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
const n1 = (v: number) => v.toFixed(v < 1 ? 2 : 1).replace(/\.0+$/, '');

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-base font-black text-white">{n}</span>
      <h2 id={`s${n}`} className={h2}>{title}</h2>
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={card}>
      <p className="text-[44px] font-black leading-none tracking-tight">{value}</p>
      <p className="mt-2 text-ink-2">{label}</p>
    </div>
  );
}

const RESEARCH: { title: string; finding: string; use: string; cite: string }[] = [
  {
    title: 'Which markers',
    finding: 'Filled pauses ("um") were the strongest acoustic marker of mild cognitive impairment in the Framingham Heart Study; pause length and frequency differ in early Alzheimer’s; speaking rate is the most consistent speech measure; retelling stories on different days stood out in phone conversations.',
    use: 'Remi tracks pace, pauses, filler and vague words, word variety, and retold stories.',
    cite: 'Ding et al. 2024 · Pistono et al. · Hamrick et al. 2023 · Yamada et al. 2020',
  },
  {
    title: 'Compare him with himself',
    finding: 'Following each person’s own speaking style over time did better than one-off snapshots in the I-CONECT video-chat trial. Models trained on older recordings can pick up recording conditions instead of speech.',
    use: 'Every marker is scored against his own usual, built from his first weeks of chats.',
    cite: 'Hoang et al. 2025 · Liu et al. 2024',
  },
  {
    title: 'Never trust one call',
    finding: 'Single speech sessions are only moderately reliable (ICC 0.22–0.92); averages over several sessions are reliable (ICC ≥ 0.75).',
    use: 'Remi averages by week and needs weeks of evidence before writing to the family.',
    cite: 'Robin et al. 2025 · van den Berg et al. 2024',
  },
];

const PERSONAS: { key: 'drift' | 'stable' | 'mood'; title: string; planted: string; basis: string }[] = [
  {
    key: 'drift', title: 'Slow change',
    planted: 'From week 3: pauses 650 → 850 ms and 12 → 17 per 100 words, pace −20 words/min, more fillers, less word variety, retold stories rising to ~3 a week.',
    basis: 'Sized from published gaps between early cognitive impairment and controls.',
  },
  {
    key: 'stable', title: 'Steady',
    planted: 'No change. Ordinary ups and downs, plus one week with a cold that lengthens pauses.',
    basis: 'Tests how often Remi would worry a family for nothing.',
  },
  {
    key: 'mood', title: 'Two low weeks',
    planted: 'Low mood in weeks 4–5 with slightly slower speech and longer pauses, then recovery. No extra retold stories.',
    basis: 'Low mood can look like cognitive change in speech; it should get a wellbeing card instead.',
  },
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

  return (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto max-w-[1200px] space-y-14 px-4 pb-16 md:px-8">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[40px] font-black leading-tight tracking-tight">Noticing slow changes in speech, without crying wolf</h1>
            <SimulatedBadge />
          </div>
          <p className={lede}>
            Research links changes in everyday speech to early cognitive decline: more and longer pauses, slower talking,
            more &quot;um&quot;s, and the same stories told again. These changes are small and gradual, and easy to miss on
            a weekly phone call. {APP_NAME} hears Grandpa often, so it can compare him with himself over months. The hard part
            is deciding when a change is real enough to tell the family. This page shows how we decided, and how we tested it
            on simulated people before trusting it.
          </p>
        </header>

        <section aria-label="Headline results" className="grid gap-4 md:grid-cols-3">
          <Stat value={`${pc(full.driftIndexDetectedPct)}`} label={`of slow changes spread over six months were noticed, typically ${full.driftIndexDelayMedian} weeks in`} />
          <Stat value={`1 in ${yearsPerNote} yrs`} label={`an unneeded note for a steady person, ${fewer}× fewer than our first rule`} />
          <Stat value={`${pc(di.moodCognitiveAlertPct)}`} label={`of low-mood weeks were mistaken for a change in talking (first rule: ${pc(cur.moodCognitiveAlertPct)})`} />
        </section>

        <section aria-labelledby="s1" className="space-y-4">
          <Step n={1} title="What the research told us" />
          <div className="grid gap-4 lg:grid-cols-3">
            {RESEARCH.map((r) => (
              <article key={r.title} className={card}>
                <h3 className="text-[22px] font-extrabold">{r.title}</h3>
                <p className="mt-2 text-ink-2">{r.finding}</p>
                <p className="mt-3 font-bold">{r.use}</p>
                <p className="mt-3 text-base text-ink-2">{r.cite}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="s2" className="space-y-4">
          <Step n={2} title="What we built" />
          <ol className={`${card} max-w-none list-decimal space-y-2 pl-10 md:pl-12`}>
            <li><strong>Score each chat against his usual.</strong> Each marker becomes &quot;how many of his own spreads away from his typical value&quot;, using 8 early chats (skipping the first two, while he gets used to {APP_NAME}).</li>
            <li><strong>Combine into one weekly score.</strong> Markers are averaged with less weight on the least reliable ones, then scaled so 1 means one of his ordinary week-to-week swings.</li>
            <li><strong>Wait for persistence.</strong> The family gets a note only if the weekly score is at least 1.5 in 3 of the last 4 weeks and still trending up. A smoothed trend can mark a week as &quot;watching&quot; on the dashboard, but never messages anyone.</li>
            <li><strong>Route low mood elsewhere.</strong> If mood has been low at the same time, the family gets a wellbeing card instead of a check-up note.</li>
          </ol>
        </section>

        <section aria-labelledby="s3" className="space-y-4">
          <Step n={3} title="How we simulated people" />
          <p className={lede}>
            We didn&apos;t write fake conversations. For each simulated chat we generated the numbers the marker code would
            produce: his usual value, plus any planted change, plus a week-to-week wobble (some weeks are just off), plus
            chat-to-chat noise that is larger for short chats, plus an occasional glitch like a bad connection. Noise
            levels come from the published reliability studies. People call about 4 times a week and miss 15% of calls.
            Each person was run {evalData.seeds} times with different random seeds.
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {PERSONAS.map((p) => (
              <article key={p.key} className={card}>
                <h3 className="text-[22px] font-extrabold">{p.title}</h3>
                <p className="mt-2 text-ink-2">{p.planted}</p>
                <p className="mt-2 text-base font-bold">{p.basis}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="s4" className="space-y-4">
          <Step n={4} title="Results" />

          <h3 className="pt-2 text-[24px] font-black">A change at a realistic pace</h3>
          <p className={lede}>
            The slow-change person, with the full change spread across six months (weeks 3–26). In this typical run the
            first note comes in week {realisticNotes[0]}, about halfway through the change. While the change continues,
            reminders come no more than once every 4 weeks.
          </p>
          <div className={card}>
            <DriftIndexChart weeks={realisticExample} height={260} title="Six-month slow change: weekly score" />
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

          <h3 className="pt-6 text-[24px] font-black">Three people side by side (8 weeks, compressed)</h3>
          <DriftLegend />
          <div className="grid gap-4 lg:grid-cols-3">
            {PERSONAS.map((p) => {
              const weeks = examples[p.key];
              const noted = weeks.find((w) => w.nudge);
              const wellbeing = weeks.find((w) => w.wellbeingCard);
              return (
                <article key={p.key} className={card}>
                  <h4 className="text-[22px] font-extrabold">{p.title}</h4>
                  <div className="mt-3">
                    <DriftIndexChart weeks={weeks} height={210} title={`${p.title}: weekly score`} />
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

          <h3 className="pt-6 text-[24px] font-black">Compared with simpler rules</h3>
          <div className={`${card} overflow-x-auto p-0 md:p-0`}>
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-base text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-bold">Rule</th>
                  <th className="px-4 py-3 text-right font-bold">Slow change noticed (8 wk)</th>
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

          <h3 className="pt-6 text-[24px] font-black">Every setting is a trade-off</h3>
          <div className={card}>
            <TradeoffChart sweep={evalData.sweep as SweepPoint[]} />
          </div>
          <p className={small}>
            Each dot is a variation of the rule (8-week runs). Up and to the left is better. A stricter line or a longer
            baseline sends fewer unneeded notes but notices less; &quot;2 of 4 weeks&quot; notices more but writes to a
            steady family almost once a year. Hover a dot for its numbers.
          </p>
        </section>

        <section aria-labelledby="s5" className="space-y-4">
          <Step n={5} title="Checked on generated conversations">
            <SimulatedBadge />
          </Step>
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

        <section aria-labelledby="limits" className={`${card} space-y-2`}>
          <h2 id="limits" className="text-[24px] font-black">What this does and doesn&apos;t show</h2>
          <ul className="list-disc space-y-1.5 pl-6 text-base text-ink-2">
            <li>It shows the rule behaves as designed: quiet for steady people, not fooled by low mood, responsive to sustained change. It does not show how well it works on real people; that needs months of real chats.</li>
            <li>Which markers to track and how noisy they are come from published studies of structured speech tasks. Real phone chats are probably noisier. The thresholds are our engineering choices.</li>
            <li>{APP_NAME} notices changes in how someone talks compared with their own usual. Sleep, illness, mood, hearing or a new phone can all cause them. It cannot diagnose anything; it suggests mentioning a lasting change at the next check-up.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
