import Link from 'next/link';
import type { DriftIndexView } from '@/lib/types';
import { DriftIndexChart, DriftLegend } from './research/DriftIndexChart';

/** Read-only family view of stored evidence; computed flags never imply delivery. */
export function DriftIndexCard({ view }: { view: DriftIndexView }) {
  const { baselineProgress: progress, repeatCoverage: repeats } = view;
  const weeks = view.result.weeks.map(week => ({ ...week, week: week.week + 1 }));
  const latest = weeks.at(-1);
  const state = !progress.ready ? 'Learning his usual'
    : view.completedMonitoringWeeks === 0 ? 'No completed monitoring week yet'
    : latest?.nudge ? 'Nudge rule met (computed only)'
    : latest?.wellbeingCard ? 'Wellbeing rule met (computed only)'
    : latest?.watch ? 'Watching (dashboard only)'
    : 'No nudge rule met in the latest week';
  return (
    <section aria-labelledby="drift-index" className="space-y-4 rounded-[20px] border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="drift-index" className="text-[30px] font-black tracking-tight">Drift Index</h2>
        {view.provenance.isSimulated && <span className="rounded-full bg-band px-3 py-1 text-sm font-bold">Simulated</span>}
      </div>
      <p className="text-ink-2">Changes in how he talks over time, compared with his own usual. Small ups and downs are normal.</p>
      <p className="font-bold">{state}</p>
      <p className="text-ink-2">{`${view.eligibleCallCount} eligible calls · ${progress.familiarizationCalls} of ${progress.familiarizationRequired} familiarization calls · ${progress.baselineCalls} of ${progress.baselineRequired} baseline calls`}</p>
      <p className="text-ink-2">{`${view.monitoredCallCount} calls after baseline · ${view.completedMonitoringWeeks} completed monitoring weeks`}</p>
      {!progress.ready && <p className="text-ink-2">The initial chats help Remi learn his usual before monitoring begins.</p>}
      {progress.ready && view.completedMonitoringWeeks === 0 && <p className="text-ink-2">The baseline is ready. Weeks that overlap the baseline still count as learning his usual, even when they include later calls.</p>}
      {weeks.length > 0 && <>
        <DriftIndexChart weeks={weeks} title="Drift Index by week, computed from stored call markers" computedStates />
        <DriftLegend showEwma={weeks.some(w => !w.baselineWeek && w.ewma !== null)} computedStates />
      </>}
      <p className="text-ink-2">{`${repeats.knownCallCount} of ${view.eligibleCallCount} eligible calls have known repeat results. `}
        {repeats.knownCallCount > 0 ? `${repeats.unpromptedStoryCount} unprompted repeated stories across those calls. Only unprompted stories contribute to the repeat rule.` : 'Repeat counts are unavailable.'}
        {repeats.unknownCallCount > 0 && ` ${repeats.unknownCallCount} calls have unknown repeat results; unknown does not mean zero.`}
      </p>
      <p className="text-sm text-ink-2">{view.provenance.timing === 'synthetic_authored'
        ? 'Simulated call timing is authored, not measured from audio. These markers are not measurements of a real caller.'
        : view.provenance.timing === 'unknown' ? 'Timing provenance is unknown.' : 'Computed from stored call timing.'}</p>
      <p className="text-sm text-ink-2">Computed from stored markers and available repeat detector results. No notification has been sent by this computation.</p>
      <Link href="/research" className="text-sm font-bold underline underline-offset-4">Explore longer static simulated scenarios</Link>
    </section>
  );
}
