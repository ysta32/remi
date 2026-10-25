import { ElderPicker } from '@/components/ElderPicker';
import { APP_NAME } from '@/lib/config';

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-12">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Who are we checking in on?</h1>
        <p className="max-w-2xl text-lg text-ink-soft">
          {APP_NAME} is a friendly FaceTime companion. After each chat, you’ll find his stories, fun facts, and gentle notes here.
        </p>
      </div>
      <ElderPicker />
    </main>
  );
}
