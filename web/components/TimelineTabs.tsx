import Link from 'next/link';

const TABS = [
  { id: 'chats', label: 'Chats' },
  { id: 'doing', label: 'How he’s doing' },
] as const;

export function TimelineTabs({ elderId, tab, fixture }: { elderId: string; tab: 'chats' | 'doing'; fixture?: string }) {
  const href = (id: 'chats' | 'doing') => {
    const q = new URLSearchParams();
    if (id === 'doing') q.set('tab', 'doing');
    if (fixture) q.set('fixture', fixture);
    const s = q.toString();
    return `/elders/${elderId}${s ? `?${s}` : ''}`;
  };
  return (
    <nav aria-label="Hal's page" className="inline-flex rounded-full border border-line bg-card p-1">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={href(t.id)}
          scroll={false}
          aria-current={tab === t.id ? 'page' : undefined}
          className={`rounded-full px-5 py-2 text-[17px] font-bold transition ${
            tab === t.id ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
