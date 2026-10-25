import { copy } from '@/lib/copy';

export function SimulatedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title={copy.simulatedTooltip}
      className={`inline-flex shrink-0 items-center rounded-full border border-dashed border-ink-2 px-2.5 py-0.5 text-base font-bold leading-snug text-ink-2 ${className}`}
    >
      {copy.simulatedBadge}
      <span className="sr-only">: {copy.simulatedTooltip}</span>
    </span>
  );
}
