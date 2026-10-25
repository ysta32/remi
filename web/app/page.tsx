import { Hero } from '@/components/home/Hero';
import { HomeSections } from '@/components/home/HomeSections';
import { TodayRow } from '@/components/home/TodayRow';
import { SiteNav } from '@/components/SiteNav';
import Link from 'next/link';
import { DEMO_ELDER_ID, DEMO_ELDER_PATH } from '@/lib/demo';

export default function Home() {
  return (
    <>
      <SiteNav variant="home" />
      <main className="mx-auto max-w-[1200px] space-y-16 px-4 pb-10 md:space-y-[88px] md:px-8">
        <div className="space-y-6">
          <Hero />
          <TodayRow elderId={DEMO_ELDER_ID} />
        </div>
        <HomeSections />
        <footer className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-line pt-6 text-base text-ink-2">
          <span>Remi · built at HackPSU Fall 2026</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 font-bold">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#privacy" className="hover:text-ink">Privacy</a>
            <Link href={DEMO_ELDER_PATH} className="text-ink underline decoration-2 underline-offset-4">See Hal&apos;s chats</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}
