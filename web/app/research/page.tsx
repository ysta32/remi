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
export const metadata: Metadata = { title: `How ${APP_NAME} decides when to speak up` };

type RuleResult = {
  driftDetectionPct: number; driftDelayMedianWeeks: number; driftDelayIqr: string;
  stableAnyAlert8wPct: number; stableAlertsPerPersonaYear: number; moodCognitiveAlertPct: number;
  moodWellbeingCardPct: number | null;
};
const results = evalData.results as Record<'driftIndex' | 'current' | 'naive', RuleResult>;
const examples = evalData.examples as Record<'drift' | 'stable' | 'mood', WeekPoint[]>;

const card = 'rounded-[28px] border border-line bg-card p-5 md:p-6';
const h2 = 'text-[30px] font-black tracking-tight';
const n1 = (v: number) => v.toFixed(v < 1 ? 2 : 1).replace(/\.0+$/, '');

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={card}>
      <p className="text-[44px] font-black leading-none tracking-tight">{value}</p>
      <p className="mt-2 text-ink-2">{label}</p>
    </div>
  );
}

const PERSONAS: { key: 'drift' | 'stable' | 'mood'; title: string; note: string }[] = [
  { key: 'drift', title: 'A slow change', note: 'Pace, pauses and word choice shift a little each week from week 3; more retold stories.' },
  { key: 'stable', title: 'A steady person', note: 'No change, with ordinary ups and downs and one week with a cold.' },
  { key: 'mood', title: 'Two low weeks', note: 'Sounds down in weeks 4–5, a little slower, then recovers.' },
];

const RULES: { key: 'driftIndex' | 'current' | 'naive'; name: string; how: string }[] = [
  { key: 'driftIndex', name: 'Drift Index (new)', how: 'Weekly score ≥ 1.5 in 3 of the last 4 weeks, trending up, and mood not low' },
  { key: 'current', name: 'Group rule (current)', how: '2 or more kinds of markers above 1.5, two weeks in a row' },
  { key: 'naive', name: 'Any unusual chat', how: 'Any single chat with any marker 2 spreads from his usual' },
];

export default function ResearchPage() {
  const di = results.driftIndex;
  const cur = results.current;
  const fewer = Math.round(cur.stableAlertsPerPersonaYear / di.stableAlertsPerPersonaYear);
  const rows = corpus.rows as CorpusRow[];
  const diWeeks = corpus.driftIndex as WeekPoint[];
  const firstNote = diWeeks.find((w) => w.nudge)?.week;

  return (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto max-w-[1200px] space-y-10 px-4 pb-16 md:px-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[40px] font-black leading-tight tracking-tight">How {APP_NAME} decides when to speak up</h1>
            <SimulatedBadge />
          </div>
          <p className="max-w-[75ch] text-ink-2">
            One chat is a noisy measurement. {APP_NAME} compares each chat with the person&apos;s own usual, combines the
            markers into one weekly score, and only writes to the family when that score stays high for weeks and keeps
            rising. Everything on this page comes from simulated people ({evalData.seeds} runs each), not real calls.
            It shows how the rule behaves; it says nothing about anyone&apos;s health.
          </p>
        </header>

        <section aria-label="Headline results" className="grid gap-4 md:grid-cols-3">
          <Stat value={`${fewer}× fewer`} label={`unneeded family notes for a steady person than the current rule (${n1(di.stableAlertsPerPersonaYear)} vs ${n1(cur.stableAlertsPerPersonaYear)} a year)`} />
          <Stat value={`${Math.round(di.driftDetectionPct)}%`} label={`of slow changes noticed by week ${evalData.weeks}; usually ${di.driftDelayMedianWeeks} weeks after they begin`} />
          <Stat value={`${Math.round(di.moodCognitiveAlertPct)}%`} label={`of low-mood weeks read as a change in talking (current rule: ${Math.round(cur.moodCognitiveAlertPct)}%); a wellbeing card shows instead`} />
        </section>

        <section aria-labelledby="personas" className="space-y-4">
          <h2 id="personas" className={h2}>Three simulated people, one rule</h2>
          <DriftLegend />
          <div className="grid gap-4 lg:grid-cols-3">
            {PERSONAS.map((p) => {
              const weeks = examples[p.key];
              const noted = weeks.find((w) => w.nudge);
              const wellbeing = weeks.find((w) => w.wellbeingCard);
              return (
                <article key={p.key} className={card}>
                  <h3 className="text-[22px] font-extrabold">{p.title}</h3>
                  <p className="mt-1 text-base text-ink-2">{p.note}</p>
                  <div className="mt-3">
                    <DriftIndexChart weeks={weeks} height={210} title={`${p.title}: weekly score`} />
                  </div>
                  <p className="mt-2 font-bold">
                    {noted
                      ? `Family note in week ${noted.week}`
                      : wellbeing
                        ? `No change note; wellbeing card from week ${wellbeing.week}`
                        : 'No note: stayed within his usual'}
                  </p>
                </article>
              );
            })}
          </div>
          <p className="max-w-[75ch] text-base text-ink-2">
            Score = how far the week sits from his usual, in his own spreads (0 is a typical week). Weeks 1–3 build the
            baseline. The smoothed line can put a week on the dashboard as &quot;watching&quot;, but only the multi-week
            rule sends a family note.
          </p>
        </section>

        <section aria-labelledby="compare" className="space-y-4">
          <h2 id="compare" className={h2}>Compared with simpler rules</h2>
          <div className={`${card} overflow-x-auto p-0 md:p-0`}>
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-base text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-bold">Rule</th>
                  <th className="px-4 py-3 text-right font-bold">Slow change noticed by wk {evalData.weeks}</th>
                  <th className="px-4 py-3 text-right font-bold">Typical wait (weeks)</th>
                  <th className="px-4 py-3 text-right font-bold">Unneeded notes / year</th>
                  <th className="px-5 py-3 text-right font-bold">Low weeks read as change</th>
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
                      <td className="px-4 py-3 text-right tabular-nums">{Math.round(x.driftDetectionPct)}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">{x.driftDelayMedianWeeks} <span className="text-ink-2">({x.driftDelayIqr})</span></td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{n1(x.stableAlertsPerPersonaYear)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{Math.round(x.moodCognitiveAlertPct)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="max-w-[75ch] text-base text-ink-2">
            &quot;Unneeded notes / year&quot; is from 52-week runs of the steady person. The &quot;any unusual chat&quot;
            rule counts every flagged chat, which is why it is so high. Targets we set ourselves: notice ≥ 90%, wait ≤ 4
            weeks, ≤ 0.1 unneeded notes a year. The Drift Index meets the first and misses the other two slightly.
          </p>
        </section>

        <section aria-labelledby="tradeoff" className="space-y-4">
          <h2 id="tradeoff" className={h2}>Every setting is a trade-off</h2>
          <div className={card}>
            <TradeoffChart sweep={evalData.sweep as SweepPoint[]} />
          </div>
          <p className="max-w-[75ch] text-base text-ink-2">
            Up and to the left is better. A stricter line or a longer baseline sends fewer unneeded notes but notices
            less; &quot;2 of 4 weeks&quot; notices everything a week sooner but writes to a steady family almost once a
            year. Hover a dot for its numbers.
          </p>
        </section>

        <section aria-labelledby="corpus" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="corpus" className={h2}>Run on the 12 generated chats</h2>
            <SimulatedBadge />
          </div>
          <p className="max-w-[75ch] text-ink-2">
            The synthetic transcript generator writes four weeks of chats for a fictional person, with planted pauses that
            get longer each week (about 600 → 1,400 ms) and stories retold two weeks later. We ran the real marker code on
            them.
          </p>
          <div className={card}>
            <CorpusCharts rows={rows} />
            <div className="mt-3"><CorpusLegend /></div>
          </div>
          <ul className="max-w-[75ch] list-disc space-y-2 pl-6">
            <li>
              <strong>Pause length tracks the planted change exactly</strong>; pace barely moves and no filler words appear,
              because the generator only varies pauses.
            </li>
            <li>
              <strong>Current rule: {corpus.currentRule.nudge ? 'note' : 'no note'}.</strong> Only one kind of marker
              (pauses) changes, and it needs two.
            </li>
            <li>
              <strong>Retold stories are invisible to the 7-day counter</strong>: every retelling comes exactly 14 days
              after the first. Counting against any earlier chat, the current rule {corpus.currentRule.nudgeAllHistory ? 'does send a note' : 'still sends no note'} (pauses + retold stories).
            </li>
            <li>
              <strong>Drift Index: {firstNote ? `note in week ${firstNote}` : 'no note'}</strong>, using a shortened setup
              for four weeks of data (week 1 as the baseline, 2 of 3 weeks). The full rule needs about two months.
            </li>
          </ul>
        </section>

        <section aria-labelledby="method" className={`${card} space-y-2`}>
          <h2 id="method" className="text-[24px] font-black">How the numbers were made</h2>
          <ul className="list-disc space-y-1.5 pl-6 text-base text-ink-2">
            <li>Each marker is compared with the person&apos;s own median and spread over 8 chats (skipping the first 2), then combined with lower weight on the least reliable markers.</li>
            <li>Simulated people make about 4 calls a week, miss 15%, have weekly ups and downs, short noisy calls, and occasional odd readings.</li>
            <li>Noise levels come from published test–retest studies of speech tasks; real phone chats are probably noisier. All thresholds are engineering choices, not clinical cut-offs.</li>
            <li>Real change, when it happens, usually unfolds over months. The simulation compresses time.</li>
            <li>{APP_NAME} notices changes in how someone talks compared with their own usual. Many everyday things (sleep, a cold, mood, hearing, a new phone) can cause them. It cannot diagnose anything.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
