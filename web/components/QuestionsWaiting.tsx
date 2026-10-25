import type { ElderProfile } from '@/lib/api';

export function QuestionsWaiting({ questions, name }: { questions: ElderProfile['questions']; name: string }) {
  const waiting = questions.filter((q) => q.status === 'pending');
  if (waiting.length === 0) return null;
  return (
    <div className="rounded-3xl border border-dashed border-accent/40 bg-accent-soft/50 p-5">
      <h3 className="font-display text-lg font-semibold text-accent">Waiting for {name}’s next chat</h3>
      <ul className="mt-3 space-y-2">
        {waiting.map((q) => (
          <li key={q.id}>
            <p className="font-semibold">“{q.text}”</p>
            <p className="text-sm text-ink-soft">from {q.askedBy}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
