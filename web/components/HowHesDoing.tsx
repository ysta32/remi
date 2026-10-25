import { copy } from '@/lib/copy';
import { buildSignals } from '@/lib/signals';
import type { Timeline } from '@/lib/types';
import { Repeats } from './Repeats';
import { SignalCard } from './SignalCard';

export function HowHesDoing({ timeline }: { timeline: Timeline }) {
  const name = timeline.elder.preferredName;
  if (!timeline.consent.elderConfirmed) {
    return <p className="rounded-[20px] border border-line bg-card p-5">{copy.notYetConfirmed(name)}</p>;
  }
  if (timeline.markers.length === 0) {
    return <p className="rounded-[20px] border border-line bg-card p-5">Remi will start comparing after a few more chats.</p>;
  }
  const signals = buildSignals(timeline.markers);
  return (
    <div className="space-y-6">
      <p className="max-w-[70ch] text-ink-2">{copy.trendsHeader(name)}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {signals.map((s) => <SignalCard key={s.key} signal={s} />)}
      </div>
      {timeline.repeats.length > 0 && (
        <section aria-labelledby="retold" className="space-y-3">
          <h2 id="retold" className="text-[30px] font-black tracking-tight">Stories told more than once in a week</h2>
          <Repeats repeats={timeline.repeats} />
        </section>
      )}
    </div>
  );
}
