import { Hero } from '@/components/home/Hero';
import { HomeSections } from '@/components/home/HomeSections';
import { TodayRow } from '@/components/home/TodayRow';
import { SiteNav } from '@/components/SiteNav';
import { DEMO_ELDER_ID } from '@/lib/demo';

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
        <footer className="flex flex-wrap justify-between gap-x-8 gap-y-2 border-t border-line pt-6 text-base text-ink-2">
          <span>Remi · built at HackPSU Fall 2026</span>
          <span>Made by Stanley, Siyuan, Kevin, Ryan and Jimmy</span>
        </footer>
      </main>
    </>
  );
}
