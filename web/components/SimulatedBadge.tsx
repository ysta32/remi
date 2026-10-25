import { copy } from '@/lib/copy';

export function SimulatedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title={copy.simulatedTooltip}
      className={`inline-flex shrink-0 items-center rounded-full border border-dashed border-sim px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-ink-soft ${className}`}
    >
      {copy.simulatedBadge}
      <span className="sr-only">: {copy.simulatedTooltip}</span>
    </span>
  );
}
