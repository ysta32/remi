import Image from 'next/image';
import Link from 'next/link';
import hal from '@/public/images/hal-armchair.png';
import { DEMO_ELDER_PATH } from '@/lib/demo';

export function Hero() {
  return (
    <section className="grid overflow-hidden rounded-[28px] bg-hero md:grid-cols-[1fr_1.1fr] md:rounded-[40px]">
      <div className="px-6 pb-4 pt-8 md:py-16 md:pl-14 md:pr-0">
        <h1 className="text-[40px] font-black leading-[1.08] tracking-tight md:text-[60px]">
          Grandpa calls.<br />Remi listens.<br />You get his <span className="rounded-xl bg-joy px-2.5">stories.</span>
        </h1>
        <p className="mt-5 max-w-[32ch] text-[19px] text-ink-on-hero md:text-[20px]">
          He FaceTimes a warm, patient companion that remembers every story. You get the fun facts, and a gentle note if anything seems to change.
        </p>
        <Link href={DEMO_ELDER_PATH} className="mt-7 inline-flex items-center rounded-full bg-ink px-7 py-4 text-lg font-extrabold text-white hover:bg-[#2b3d5f]">
          See Hal&apos;s chats
        </Link>
        <p className="mt-5 text-[17px] text-ink-on-hero">
          Judges: <b className="text-ink">FaceTime Remi as Hal</b>, then watch his page update.
        </p>
        <p className="mt-2 text-base text-ink-on-hero">Live demo · Hal&apos;s earlier history is simulated.</p>
      </div>

      {/* The bubble sits in the illustration's transparent upper-left, beside the phone, never over Hal. */}
      <div className="relative flex items-end px-4 pb-6 md:px-6 md:pb-8">
        <div className="relative w-full">
          <div className="absolute inset-x-[8%] bottom-[2%] h-[7%] rounded-[50%] bg-[#8fb8de]" aria-hidden />
          <p className="mb-3 w-fit max-w-[260px] rounded-[20px] md:absolute md:left-0 md:top-[3%] md:z-10 md:mb-0 md:w-[36%] md:min-w-[150px] rounded-bl-md bg-card px-3.5 py-2.5 text-base leading-snug shadow-[0_12px_24px_-16px_rgba(0,0,0,0.35)]">
            <b className="block text-base tracking-wide text-ink-2">REMI</b>
            Hi Hal! Sam was wondering… what was your first car?
          </p>
          <Image src={hal} alt="An older man in a yellow cardigan laughs on a video call from his mint armchair, next to a tomato plant."
            priority sizes="(max-width: 819px) 100vw, 640px" className="relative h-auto w-full" />
        </div>
      </div>
    </section>
  );
}
