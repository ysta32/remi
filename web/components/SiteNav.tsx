import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { DEMO_ELDER_PATH } from '@/lib/demo';

const pill =
  'inline-flex items-center rounded-full bg-ink px-5 py-2.5 font-bold text-white transition hover:bg-[#2b3d5f] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';

export function SiteNav({ variant }: { variant: 'home' | 'app' }) {
  return (
    <nav className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-5 md:px-8">
      <Link href="/" className="text-[30px] font-black tracking-tight text-ink">
        {APP_NAME}
      </Link>
      <div className="flex items-center gap-1 text-[17px] font-bold">
        {variant === 'home' && (
          <>
            <a href="#how" className="hidden rounded-full px-4 py-2.5 hover:bg-card md:inline">How it works</a>
            <a href="#privacy" className="hidden rounded-full px-4 py-2.5 hover:bg-card md:inline">Privacy</a>
          </>
        )}
        <Link href="/evaluation" className="rounded-full px-3 py-2.5 text-[15px] hover:bg-card md:px-4 md:text-[17px]">Evaluation</Link>
        <Link href="/research" className="hidden rounded-full px-4 py-2.5 hover:bg-card md:inline">Research</Link>
        <Link href={DEMO_ELDER_PATH} className={pill}>
          See Hal&apos;s chats
        </Link>
      </div>
    </nav>
  );
}
