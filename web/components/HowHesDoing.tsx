import { copy } from '@/lib/copy';
import { buildSignals } from '@/lib/signals';
import type { Timeline } from '@/lib/types';
import { DriftIndexCard } from './DriftIndexCard';
import { RepeatDetections } from './RepeatDetections';
import { Repeats } from './Repeats';
import { SignalCard } from './SignalCard';

export function HowHesDoing({ timeline }: { timeline: Timeline }) {
  const name = timeline.elder.preferredName;
  if (!timeline.consent.elderConfirmed) {
    return <p className="rounded-[20px] border border-line bg-card p-5">{copy.notYetConfirmed(name)}</p>;
  }
  const driftIndex = timeline.consent.effective?.speechTrends ? timeline.driftIndex : undefined;
  if (timeline.markers.length === 0 && !timeline.repeatAnalysis && !driftIndex) {
    return <p className="rounded-[20px] border border-line bg-card p-5">Remi will start comparing after a few more chats.</p>;
  }
  const signals = timeline.markers.length ? buildSignals(timeline.markers).filter(s => !timeline.repeatAnalysis || s.key !== 'retold') : [];
  return (
    <div className="space-y-6">
      {driftIndex && <DriftIndexCard view={driftIndex} />}
      {timeline.repeatAnalysis && <RepeatDetections analysis={timeline.repeatAnalysis} elderId={timeline.elder.id} />}
      <p className="max-w-[70ch] text-ink-2">{copy.trendsHeader(name)}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {signals.map((s) => <SignalCard key={s.key} signal={s} />)}
      </div>
      {!timeline.repeatAnalysis && timeline.repeats.length > 0 && (
        <section aria-labelledby="retold" className="space-y-3">
          <h2 id="retold" className="text-[30px] font-black tracking-tight">Stories told more than once in a week</h2>
          <Repeats repeats={timeline.repeats} />
        </section>
      )}
    </div>
  );
}
