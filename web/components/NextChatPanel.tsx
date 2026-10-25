'use client';

import { useState } from 'react';
import { addPhoto, addQuestion, PreviewOnly, removePhoto, removeQuestion, type ElderProfile } from '@/lib/api';
import { checkPhoto, checkQuestion, splitShown, waitingQuestions } from '@/lib/nextChat';

type Question = ElderProfile['questions'][number];
type Photo = ElderProfile['photos'][number];

const QUESTIONS_SHOWN = 2;
const PHOTOS_SHOWN = 5;
const quiet = 'text-base font-semibold text-[#7b879a] transition-colors hover:text-ink';
const field = 'min-w-0 rounded-full border border-line bg-card px-4 py-2 text-base placeholder:text-[#7b879a] focus:border-ink-2 focus:outline-none';

function Thumb({ photo, onRemove }: { photo: Photo; onRemove: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="group relative">
      {broken ? (
        <span className="grid size-14 place-items-center rounded-lg bg-card text-base font-black text-[#3a6aa0]" title={photo.caption}>
          {photo.caption.trim().charAt(0).toUpperCase() || '·'}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- API-served family photo of unknown size
        <img src={photo.imageUrl} alt={photo.caption} title={photo.caption} onError={() => setBroken(true)}
          className="size-14 rounded-lg border-2 border-card object-cover" />
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove photo: ${photo.caption}`}
        className="absolute -right-1.5 -top-1.5 hidden size-6 place-items-center rounded-full bg-ink text-sm font-bold text-white group-focus-within:grid group-hover:grid">
        ×
      </button>
    </li>
  );
}

// What Remi brings to Hal's next call: waiting questions and photos. Adds and removes go straight to
// the API (contracts §5), which the agent reads before each call. With sample data they stay on screen only.
export function NextChatPanel({ elderId, elder, name, onChanged }: {
  elderId: string; elder: ElderProfile; name: string; onChanged: () => void;
}) {
  const askers = [...new Set([elder.primaryContactName, ...elder.members.map((m) => m.name)].filter(Boolean))];
  const [text, setText] = useState('');
  const [askedBy, setAskedBy] = useState(askers[0] ?? '');
  const [allQuestions, setAllQuestions] = useState(false);
  const [allPhotos, setAllPhotos] = useState(false);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [people, setPeople] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Sample-data mode: changes live here only.
  const [local, setLocal] = useState<{ questions: Question[]; photos: Photo[]; removed: Set<string> }>(
    { questions: [], photos: [], removed: new Set() },
  );
  const preview = local.questions.length > 0 || local.photos.length > 0 || local.removed.size > 0;

  const questions = [...waitingQuestions(elder.questions), ...local.questions].filter((q) => !local.removed.has(q.id));
  const photos = [...local.photos, ...elder.photos].filter((p) => !local.removed.has(p.id));
  const q = allQuestions ? { shown: questions, more: 0 } : splitShown(questions, QUESTIONS_SHOWN);
  const ph = allPhotos ? { shown: photos, more: 0 } : splitShown(photos, PHOTOS_SHOWN);

  async function run(save: () => Promise<unknown>, onPreview: () => void, done: () => void) {
    setBusy(true);
    setMessage(null);
    try {
      await save();
      done();
      onChanged();
    } catch (e) {
      if (e instanceof PreviewOnly) { onPreview(); done(); }
      else setMessage(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const problem = checkQuestion(text, askedBy);
    if (problem) return setMessage(problem);
    const draft: Question = { id: `local-${Date.now()}`, text: text.trim(), askedBy: askedBy.trim(), status: 'pending' };
    run(() => addQuestion(elderId, draft.text, draft.askedBy),
      () => setLocal((l) => ({ ...l, questions: [...l.questions, draft] })),
      () => setText(''));
  }

  function savePhoto(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setMessage('Choose a photo first.');
    const problem = checkPhoto(file, caption);
    if (problem) return setMessage(problem);
    const draft: Photo = { id: `local-${Date.now()}`, caption: caption.trim(), people: people.trim(), imageUrl: URL.createObjectURL(file) };
    run(() => addPhoto(elderId, file, draft.caption, draft.people),
      () => setLocal((l) => ({ ...l, photos: [draft, ...l.photos] })),
      () => { setAdding(false); setFile(null); setCaption(''); setPeople(''); });
  }

  const remove = (id: string, save: () => Promise<unknown>) =>
    run(id.startsWith('local-') ? () => Promise.reject(new PreviewOnly('local')) : save,
      () => setLocal((l) => ({ ...l, removed: new Set(l.removed).add(id) })), () => {});

  return (
    <section aria-labelledby="next-chat" className="rounded-[20px] bg-sky-soft p-4">
      <h2 id="next-chat" className="text-[22px] font-extrabold">For {name}’s next chat</h2>

      <form onSubmit={ask} className="mt-3 grid gap-2">
        <label className="sr-only" htmlFor="ask">Question for {name}</label>
        <input id="ask" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask ${name} something…`}
          maxLength={500} className={`${field} w-full`} />
        <span className="flex items-center gap-2">
          <label htmlFor="asker" className="text-base text-ink-2">from</label>
          {askers.length ? (
            <select id="asker" value={askedBy} onChange={(e) => setAskedBy(e.target.value)} className={`${field} pr-8`}>
              {askers.map((a) => <option key={a}>{a}</option>)}
            </select>
          ) : (
            <input id="asker" value={askedBy} onChange={(e) => setAskedBy(e.target.value)} placeholder="Your name" className={`${field} w-32`} />
          )}
          <button type="submit" disabled={busy} className="ml-auto rounded-full bg-ink px-5 py-2 font-bold text-white hover:bg-[#2b3d5f] disabled:opacity-60">
            Add question
          </button>
        </span>
      </form>

      {questions.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {q.shown.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3">
              <span><b className="block leading-snug">“{x.text}”</b><span className="text-base text-ink-2">from {x.askedBy}</span></span>
              <button type="button" onClick={() => remove(x.id, () => removeQuestion(x.id))} className={`${quiet} shrink-0`}
                aria-label={`Remove question: ${x.text}`}>Remove</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-base text-ink-2">No questions waiting. Remi will just chat.</p>
      )}
      {(q.more > 0 || allQuestions) && questions.length > QUESTIONS_SHOWN && (
        <button type="button" onClick={() => setAllQuestions((v) => !v)} className={`${quiet} mt-1`}>
          {allQuestions ? 'Show fewer' : `+${q.more} more waiting`}
        </button>
      )}

      <div className="mt-4 border-t border-[#c4d9ee] pt-3">
        <p className="text-base font-bold text-ink-2">Photos Remi can show</p>
        <ul className="mt-2 flex flex-wrap items-center gap-2">
          {ph.shown.map((p) => <Thumb key={p.id} photo={p} onRemove={() => remove(p.id, () => removePhoto(p.id))} />)}
          <li>
            <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-label="Add a photo"
              className="grid size-14 place-items-center rounded-lg border-2 border-dashed border-[#9fbfe0] text-2xl font-bold text-[#3a6aa0] hover:border-ink-2 hover:text-ink">
              +
            </button>
          </li>
          {(ph.more > 0 || allPhotos) && photos.length > PHOTOS_SHOWN && (
            <li><button type="button" onClick={() => setAllPhotos((v) => !v)} className={quiet}>{allPhotos ? 'Show fewer' : `+${ph.more} more`}</button></li>
          )}
        </ul>
        {adding && (
          <form onSubmit={savePhoto} className="mt-3 grid gap-2">
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-base file:mr-3 file:rounded-full file:border-0 file:bg-card file:px-4 file:py-1.5 file:font-bold" />
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption, e.g. Dad with his first car, 1962" maxLength={300} className={field} />
            <input value={people} onChange={(e) => setPeople(e.target.value)} placeholder="Who’s in it (optional)" maxLength={300} className={field} />
            <span className="flex gap-2">
              <button type="submit" disabled={busy} className="rounded-full bg-ink px-5 py-2 font-bold text-white hover:bg-[#2b3d5f] disabled:opacity-60">Save photo</button>
              <button type="button" onClick={() => setAdding(false)} className={quiet}>Cancel</button>
            </span>
          </form>
        )}
      </div>

      {message && <p className="mt-3 text-base font-bold text-family-ink" role="alert">{message}</p>}
      {preview && <p className="mt-3 text-base text-ink-2">Sample data: changes show here only and aren’t saved.</p>}
    </section>
  );
}
