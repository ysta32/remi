import type { ElderProfile } from '@/lib/api';

export function QuestionsWaiting({ questions, name }: { questions: ElderProfile['questions']; name: string }) {
  const waiting = questions.filter((q) => q.status === 'pending');
  if (waiting.length === 0) return null;
  return (
    <section aria-labelledby="waiting" className="rounded-[20px] bg-sky-soft p-4">
      <h2 id="waiting" className="text-[22px] font-extrabold">Waiting for {name}’s next chat</h2>
      <ul className="mt-2 space-y-2">
        {waiting.map((q) => (
          <li key={q.id}>
            <p className="font-bold">“{q.text}”</p>
            <p className="text-base text-ink-2">from {q.askedBy}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
