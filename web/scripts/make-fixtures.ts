// Writes fixtures/demo/*.json in the exact contract shapes so the family UI can be built before
// B's endpoints exist. Run: npm run fixtures
//
// Baselines, z-scores and nudges here are a display-only approximation of C's rules
// (docs/markers.md §7–8); the real seed calls recomputeElder() instead.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CallCard, ConsentMap, MarkerGroup, MarkerKey, MarkerSeries, Timeline } from '../lib/types.ts';
import {
  callDates, calls, elder, markersFor, MARKER_UNITS, photos, prng, questions, storiesFor, type Scenario,
} from './demo-data.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'demo');
const NOW = new Date();

// docs/markers.md §5 labels and explainers; SPEC.md §10 concern + group.
type DemoMarkerKey = MarkerKey;
const META: Record<DemoMarkerKey, { label: string; explainer: string; concern: 'up' | 'down'; group: MarkerGroup }> = {
  speech_rate: { label: 'Speaking pace', explainer: 'How quickly he talks while speaking, compared with his usual.', concern: 'down', group: 'pace' },
  pause_rate: { label: 'Pauses', explainer: 'How often he pauses mid-thought.', concern: 'up', group: 'pauses' },
  mean_pause_ms: { label: 'Pause length', explainer: 'How long those pauses usually last.', concern: 'up', group: 'pauses' },
  wfp_rate: { label: 'Searching for words', explainer: 'Longer pauses next to words like "um" or "thing."', concern: 'up', group: 'pauses' },
  filler_rate: { label: 'Filler words', explainer: 'Words like "um" and "uh."', concern: 'up', group: 'words' },
  vague_rate: { label: 'General words', explainer: 'Words like "thing" or "stuff" in place of a specific word.', concern: 'up', group: 'words' },
  mattr: { label: 'Word variety', explainer: 'How varied his vocabulary is within a stretch of talk.', concern: 'down', group: 'words' },
  repeat_stories: { label: 'Retold stories', explainer: 'Stories he brought up himself that he also told in another call that week.', concern: 'up', group: 'repetition' },
  pitch_var: { label: 'Voice rise and fall', explainer: 'How much his voice rises and falls while he talks, compared with his usual.', concern: 'down', group: 'voice' },
  pitch_range: { label: 'Voice range', explainer: 'The spread between his lower and higher notes when he talks.', concern: 'down', group: 'voice' },
};

const PLAIN: Record<MarkerGroup, string> = {
  pace: 'speaking a bit more slowly than usual',
  pauses: 'pausing more often or for longer',
  words: 'using more filler or general words, or a narrower range of words',
  repetition: 'retelling some of the same stories within a week',
  voice: 'speaking with less rise and fall in his voice than usual',
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x: number, dp = 2) => Math.round(x * 10 ** dp) / 10 ** dp;

interface LiveCall { id: string; at: Date; status: CallCard['status']; durationS: number | null; markers: Partial<Record<MarkerKey, number>> | null }

function build(scenario: Scenario, opts: { confirmed: boolean; live?: LiveCall }): Timeline {
  const rand = prng(42);
  const dates = callDates(NOW);
  const rows = calls.map((c, i) => {
    const m = markersFor(c.n, scenario, rand);
    const stories = storiesFor(c, scenario);
    const repeats = scenario === 'drift' && c.n >= 10 ? 1 : 0;
    return { c, id: `call-${String(c.n).padStart(2, '0')}`, at: dates[i], m: { ...m, repeat_stories: repeats } as Record<DemoMarkerKey, number>, stories };
  });

  const proposed: ConsentMap = { summaries: true, funFacts: true, speechTrends: true, mood: true };
  const effective: ConsentMap = opts.confirmed ? proposed : { summaries: false, funFacts: false, speechTrends: false, mood: false };

  const markers: MarkerSeries[] = (Object.keys(META) as DemoMarkerKey[]).map((key) => {
    const meta = META[key];
    const base = key === 'repeat_stories' ? null : (() => {
      const xs = rows.slice(0, 6).map((r) => r.m[key]);
      const med = median(xs);
      return { median: round(med, 3), mad: round(median(xs.map((x) => Math.abs(x - med))), 3), n: 6 };
    })();
    const zOf = (v: number) => {
      if (!base) return null;
      const scale = Math.max(1.4826 * base.mad, 0.03 * Math.abs(base.median), 1e-6);
      const z = (v - base.median) / scale;
      return round(meta.concern === 'up' ? z : -z);
    };
    const points: MarkerSeries['points'] = rows.map((r) => ({
      callId: r.id, at: r.at.toISOString(), value: r.m[key], z: zOf(r.m[key]), confidence: 'high', isSimulated: true,
    }));
    const live = opts.live;
    if (live?.markers) {
      const v = live.markers[key] ?? null;
      // A short live demo call is under 100 caller words → low confidence (plotted hollow).
      points.push({ callId: live.id, at: live.at.toISOString(), value: v, z: v === null ? null : zOf(v), confidence: v === null ? 'na' : 'low', isSimulated: false });
    }
    return { key, ...meta, unit: MARKER_UNITS[key], baseline: base, points };
  });

  const callCards: CallCard[] = rows.map(({ c, id, at }) => {
    const q = questions.find((x) => x.id === c.questionId);
    return {
      id,
      startedAt: at.toISOString(),
      durationS: 360 + Math.floor(prng(c.n)() * 300),
      status: 'done',
      summary: effective.summaries ? c.summary : null,
      // Before the elder confirms, the family sees only that a call happened and its length (SPEC §12).
      photosShown: opts.confirmed ? c.photoIds.map((pid) => ({ id: pid, caption: photos.find((p) => p.id === pid)!.caption })) : [],
      familyQuestion: opts.confirmed && q ? { text: q.text, askedBy: q.askedBy, answer: c.questionAnswer } : null,
      mood: effective.mood ? c.mood : null,
      isSimulated: true,
    };
  });

  const funFacts: Timeline['funFacts'] = rows.flatMap(({ c, id, at }) =>
    c.funFacts.map((f, i) => ({
      id: `ff-${id}-${i}`, text: f.text, quote: f.quote,
      askedBy: questions.find((q) => q.id === f.questionId)?.askedBy ?? null,
      at: at.toISOString(), isSimulated: true,
    })),
  );

  const live = opts.live;
  if (live) {
    callCards.push({
      id: live.id, startedAt: live.at.toISOString(), durationS: live.durationS, status: live.status,
      summary: live.status === 'done' && effective.summaries
        ? "Hal told Sam about his first car, a 1957 Chevy Bel Air he bought for $300 with money from the shops. He laughed about the time it got stuck in the mud on the way to Raystown Lake. He said he'd love to tell Sam the rest when he visits."
        : null,
      photosShown: [{ id: 'p-car', caption: photos.find((p) => p.id === 'p-car')!.caption }],
      familyQuestion: { text: 'What was your first car?', askedBy: 'Sam', answer: live.status === 'done' ? 'A 1957 Chevy Bel Air he bought for $300.' : null },
      mood: live.status === 'done' && effective.mood ? 'positive' : null,
      isSimulated: false,
    });
    if (live.status === 'done' && effective.funFacts) {
      funFacts.push({
        id: 'ff-live-0', text: "Hal's first car was a 1957 Chevy Bel Air he bought for $300.",
        quote: 'Three hundred dollars, two-tone, and I washed it every Sunday.', askedBy: 'Sam',
        at: live.at.toISOString(), isSimulated: false,
      });
    }
  }

  const repeatRows = rows.filter((r) => r.stories.some((s) => s.startsWith('The 1977 blizzard')));
  const repeats: Timeline['repeats'] = repeatRows.length > 1
    ? [{ summary: 'The 1977 blizzard when the roundhouse roof caved in under the snow', dates: repeatRows.map((r) => r.at.toISOString()), isSimulated: true }]
    : [];

  const groups: MarkerGroup[] = ['pace', 'pauses', 'words', 'repetition'];
  const list = groups.map((g) => PLAIN[g as keyof typeof PLAIN]).join('; ');
  const nudges: Timeline['nudges'] = scenario === 'drift' && effective.speechTrends
    ? [{
        id: 'nudge-checkup', type: 'cognitive_checkup', createdAt: rows[11].at.toISOString(),
        message: `Over the last couple of weeks, a few things about how Hal talks in our chats have shifted compared with his usual: ${list}. This isn't a diagnosis — tiredness, a cold, hearing, new medications, or mood can all cause changes like these. It might be a good time to check in with him, and to mention it at his next doctor's visit.`,
        link: 'https://www.alz.org/alzheimers-dementia/10_signs',
        isSimulated: true,
      }]
    : [];

  return {
    elder: { id: elder.id, displayName: elder.displayName, preferredName: elder.preferredName, language: elder.language },
    consent: { proposed, elderConfirmed: opts.confirmed, effective },
    calls: callCards.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    funFacts: effective.funFacts ? funFacts.sort((a, b) => b.at.localeCompare(a.at)) : [],
    markers: effective.speechTrends ? markers : [],
    repeats: effective.speechTrends ? repeats : [],
    nudges,
    processing: live?.status === 'processing' || live?.status === 'in_progress',
    generatedAt: NOW.toISOString(),
  };
}

// Fixture profile for GET /api/elders/:id (contract §5 lists the parts, not the field names).
const elderProfile = {
  ...elder,
  isSimulated: true,
  photos: photos.map((p) => ({ id: p.id, caption: p.caption, people: p.people, imageUrl: `/api/photos/${p.id}/file` })),
  questions: questions.map((q) => ({ id: q.id, text: q.text, askedBy: q.askedBy, status: q.answeredOnCall ? 'answered' : 'pending' })),
  consent: {
    proposed: { summaries: true, funFacts: true, speechTrends: true, mood: true },
    elderConfirmed: true,
    effective: { summaries: true, funFacts: true, speechTrends: true, mood: true },
  },
};

const liveAt = new Date(NOW.getTime() - 2 * 60_000);
const liveMarkers = { speech_rate: 119, pause_rate: 13.1, mean_pause_ms: 830, wfp_rate: 1.9, filler_rate: 4.5, vague_rate: 2.2, mattr: 0.71, repeat_stories: 0 };

const fixtures: Record<string, unknown> = {
  'elder.json': elderProfile,
  'timeline.json': build('drift', { confirmed: true }),
  'timeline-stable.json': build('stable', { confirmed: true }),
  'timeline-unconfirmed.json': build('drift', { confirmed: false }),
  'timeline-processing.json': build('drift', { confirmed: true, live: { id: 'call-live', at: liveAt, status: 'processing', durationS: 74, markers: null } }),
  'timeline-after-call.json': build('drift', { confirmed: true, live: { id: 'call-live', at: liveAt, status: 'done', durationS: 74, markers: liveMarkers } }),
};

mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(fixtures)) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote fixtures/demo/${name}`);
}
