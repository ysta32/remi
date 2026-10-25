import Link from 'next/link';
import { DEMO_ELDER_PATH } from '@/lib/demo';
import { buildSignals } from '@/lib/signals';

const STEPS = [
  { title: 'Grandpa calls Remi', text: 'Whenever he likes, on FaceTime. Remi shows family photos and asks the questions you sent.' },
  { title: 'Remi chats and remembers', text: 'A warm 5–10 minute chat about his life. Next time, Remi picks up where they left off.' },
  { title: 'You get his stories', text: 'A short summary and fun facts after every call, plus a gentle note if it may be time to check in.' },
];

const h2 = 'text-[30px] font-black leading-tight tracking-tight md:text-[38px]';

export function HomeSections() {
  const signals = buildSignals([]); // titles and plain-language explainers only
  return (
    <>
      <section id="how" aria-labelledby="how-h" className="scroll-mt-6">
        <h2 id="how-h" className={h2}>How it works</h2>
        <p className="mt-2 text-[19px] text-ink-2">No app, no wearable, no test to take. Just a FaceTime call.</p>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-[28px] border border-line bg-card p-6">
              <span aria-hidden className="grid size-11 place-items-center rounded-full bg-sky-soft text-lg font-black">{i + 1}</span>
              <h3 className="mt-3 text-[22px] font-extrabold leading-snug">{s.title}</h3>
              <p className="mt-1 text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="eye-h">
        <h2 id="eye-h" className={h2}>What Remi gently keeps an eye on</h2>
        <p className="mt-2 max-w-[60ch] text-[19px] text-ink-2">
          Four signals from speech research. Each one is compared only with his own usual, never with anyone else.
        </p>
        <ul className="mt-6 grid rounded-[28px] border border-line bg-card px-6 py-2 md:grid-cols-2 md:gap-x-12">
          {signals.map((s, i) => (
            <li key={s.key} className={`flex gap-3 py-4 ${i < signals.length - (signals.length % 2 || 2) ? 'border-b border-line' : 'max-md:border-b max-md:border-line max-md:last:border-0'}`}>
              <span aria-hidden className="mt-2.5 size-3 shrink-0 rounded-full bg-hero" />
              <span>
                <b className="block text-[20px]">{s.title}</b>
                <span className="text-ink-2">{s.explainer}</span>
              </span>
            </li>
          ))}
        </ul>
        <ul className="mt-4 flex flex-wrap gap-2">
          {['His own usual', 'Many things can cause a change', 'A note, never a verdict'].map((t) => (
            <li key={t} className="rounded-full bg-card px-4 py-2 text-[17px] font-bold">{t}</li>
          ))}
        </ul>
      </section>

      <section id="privacy" aria-label="Privacy and limits" className="grid scroll-mt-6 gap-4 md:grid-cols-2">
        <div className="rounded-[28px] bg-ok p-6">
          <h2 className="text-[22px] font-extrabold">He&apos;s in charge of what&apos;s shared</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Grandpa says yes on his first call</li>
            <li>You see summaries and fun facts, never transcripts</li>
            <li>Audio is deleted right after each call</li>
          </ul>
        </div>
        <div className="rounded-[28px] bg-sky-soft p-6">
          <h2 className="text-[22px] font-extrabold">A nudge, not a diagnosis</h2>
          <p className="mt-2">
            Remi isn&apos;t a medical device and doesn&apos;t diagnose anything. It notices changes compared with his own usual, which can have many causes, and suggests talking with his doctor.
          </p>
        </div>
      </section>

      <section aria-label="Meet Hal" className="flex flex-col items-start justify-between gap-5 rounded-[28px] bg-hero px-6 py-8 md:flex-row md:items-center md:rounded-[40px] md:px-14 md:py-12">
        <h2 className={h2}>Come meet Hal.</h2>
        <Link href={DEMO_ELDER_PATH} className="inline-flex rounded-full bg-ink px-7 py-4 text-lg font-extrabold text-white hover:bg-[#2b3d5f]">
          See Hal&apos;s chats
        </Link>
      </section>
    </>
  );
}
