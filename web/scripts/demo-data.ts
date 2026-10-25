// Hal Bennett demo persona and simulated history (docs/demo.md §1–2).
// Shared by scripts/make-fixtures.ts (UI fixtures) and scripts/seed.ts (DB seed).
// Everything here is SIMULATED and must be badged wherever it is shown.

import type { MarkerKey } from '../lib/types.ts';

export type Scenario = 'drift' | 'stable';

export const TIMEZONE = 'America/New_York';

export const elder = {
  id: 'elder-hal-demo',
  displayName: 'Harold Bennett',
  preferredName: 'Hal',
  language: 'en' as const,
  timezone: TIMEZONE,
  about:
    'Dad worked 38 years at the Altoona railroad shops and loves talking about it. Army 1965–67. Big Steelers fan, loves polka and his tomato garden. Mom (Dorothy) passed in 2021, so go gently there. He lives alone and gets lonely in the evenings.',
  primaryContactName: 'Linda',
  members: [
    { name: 'Linda', relation: 'daughter' },
    { name: 'Sam', relation: 'grandson' },
  ],
};

export const photos = [
  { id: 'p-shops', file: 'p-shops.jpg', caption: 'Dad at the Altoona railroad shops, 1971', people: 'Hal' },
  { id: 'p-lake', file: 'p-lake.jpg', caption: 'Hal and Mom at Raystown Lake, 1980', people: 'Hal, Dorothy' },
  { id: 'p-car', file: 'p-car.jpg', caption: 'Dad with his first car, 1962', people: 'Hal' },
];

export const questions = [
  { id: 'q-first-job', text: 'What was your first job?', askedBy: 'Linda', answeredOnCall: 2 },
  { id: 'q-met-mom', text: 'How did you meet Mom?', askedBy: 'Linda', answeredOnCall: 5 },
  { id: 'q-first-car', text: 'What was your first car?', askedBy: 'Sam', answeredOnCall: null },
];

const BLIZZARD = 'The 1977 blizzard when the roundhouse roof caved in under the snow';

export interface SeedCall {
  n: number;                       // 1–12
  summary: string;
  mood: 'positive' | 'neutral' | 'low';
  photoIds: string[];
  questionId: string | null;
  questionAnswer: string | null;
  funFacts: { text: string; quote: string; questionId: string | null }[];
  stories: string[];               // caller-initiated story topics
}

export const calls: SeedCall[] = [
  {
    n: 1,
    summary:
      'Hal and Remi got acquainted. He talked about his 38 years at the Altoona railroad shops and how loud the erecting floor got when three engines were in at once. He said he was glad to have someone to talk to in the evenings.',
    mood: 'positive', photoIds: ['p-shops'], questionId: null, questionAnswer: null, funFacts: [],
    stories: ['Working on the erecting floor at the Altoona shops'],
  },
  {
    n: 2,
    summary:
      "Hal talked about his first job sweeping floors at a bakery on 11th Avenue when he was 14. He laughed remembering the owner sneaking him day-old donuts. He said he'd like to bake bread again sometime.",
    mood: 'positive', photoIds: [], questionId: 'q-first-job',
    questionAnswer: 'Sweeping floors at a bakery on 11th Avenue when he was 14.',
    funFacts: [{
      text: "Hal's first job was sweeping floors at a bakery at 14, for 50 cents a day.",
      quote: 'Fifty cents a day and all the broken donuts I could eat.', questionId: 'q-first-job',
    }],
    stories: ['Sweeping floors at the 11th Avenue bakery at 14'],
  },
  {
    n: 3,
    summary:
      'Hal walked through his tomato garden this year: Big Boys along the fence and a few Romas his neighbor gave him. He explained his trick of putting crushed eggshells in the planting hole, and said the deer got more than their share in August.',
    mood: 'neutral', photoIds: [], questionId: null, questionAnswer: null,
    funFacts: [{
      text: 'Hal puts crushed eggshells in the planting hole of every tomato plant.',
      quote: "Eggshells in the hole, every time. My mother did it and they never split.", questionId: null,
    }],
    stories: ['His tomato garden and the eggshell trick'],
  },
  {
    n: 4,
    summary:
      'Looking at the photo from the shops, Hal named three of the men he worked beside and told how they rebuilt a K4 locomotive for a museum. He was proud the engine still runs on special excursions.',
    mood: 'positive', photoIds: ['p-shops'], questionId: null, questionAnswer: null, funFacts: [],
    stories: ['Rebuilding a K4 locomotive for the museum'],
  },
  {
    n: 5,
    summary:
      'Hal told the story of meeting Dorothy at a church dance in 1964. He said she stepped on his foot before he ever asked her to dance, and he married her two years later. He got quiet for a moment, then said she would have liked these chats.',
    mood: 'neutral', photoIds: ['p-lake'], questionId: 'q-met-mom',
    questionAnswer: 'At a church dance in 1964 — she stepped on his foot first.',
    funFacts: [{
      text: 'Hal met Dorothy at a church dance in 1964 — she stepped on his foot first.',
      quote: 'She stepped on my foot before I ever got the nerve to ask her.', questionId: 'q-met-mom',
    }],
    stories: ['Meeting Dorothy at a church dance in 1964'],
  },
  {
    n: 6,
    summary:
      'Hal talked about playing trumpet in the Hollidaysburg High marching band and the cold November games. He hummed part of the fight song and said he can still play a few bars of "Beer Barrel Polka."',
    mood: 'positive', photoIds: [], questionId: null, questionAnswer: null,
    funFacts: [{
      text: 'Hal played trumpet in the Hollidaysburg High marching band.',
      quote: 'Third chair trumpet, and I was loud about it.', questionId: null,
    }],
    stories: ['Playing trumpet in the Hollidaysburg High marching band'],
  },
  {
    n: 7,
    summary:
      'Hal shared his Steelers memories, including watching the Immaculate Reception on a borrowed TV in 1972. He thinks this year’s team needs a better offensive line.',
    mood: 'positive', photoIds: [], questionId: null, questionAnswer: null, funFacts: [],
    stories: ['Watching the Immaculate Reception in 1972'],
  },
  {
    n: 8,
    summary:
      'Seeing the Raystown Lake photo, Hal remembered summer weekends fishing for bass with Dorothy and the kids. He said Linda caught the biggest fish one year and never let him forget it.',
    mood: 'positive', photoIds: ['p-lake'], questionId: null, questionAnswer: null, funFacts: [],
    stories: ['Fishing weekends at Raystown Lake'],
  },
  {
    n: 9,
    summary:
      'Hal told about the 1977 blizzard, when he and two other men slept at the shops for two nights to keep the engines from freezing. He described the roundhouse roof giving way under the snow.',
    mood: 'neutral', photoIds: ['p-shops'], questionId: null, questionAnswer: null,
    funFacts: [{
      text: 'During the 1977 blizzard, Hal slept two nights at the shops to keep the engines running.',
      quote: 'We slept on the bench by the boiler. Nobody was going home in that.', questionId: null,
    }],
    stories: [BLIZZARD],
  },
  {
    n: 10,
    summary:
      'Hal talked about the 1977 blizzard and the night at the roundhouse again, and about how the town dug out afterward. He mentioned his neighbor checks in on him most mornings.',
    mood: 'neutral', photoIds: [], questionId: null, questionAnswer: null, funFacts: [],
    stories: [BLIZZARD],
  },
  {
    n: 11,
    summary:
      'Hal said the garden is finished for the year and he pulled the last green tomatoes to ripen on the windowsill. He came back to the blizzard story and the roundhouse roof.',
    mood: 'neutral', photoIds: [], questionId: null, questionAnswer: null, funFacts: [],
    stories: [BLIZZARD],
  },
  {
    n: 12,
    summary:
      'Hal described the 1977 blizzard and the roundhouse once more, then talked about looking forward to Sam visiting from Penn State for Thanksgiving.',
    mood: 'positive', photoIds: [], questionId: null, questionAnswer: null, funFacts: [],
    stories: [BLIZZARD],
  },
];

// In `stable`, the blizzard story is told only on call 9.
export function storiesFor(call: SeedCall, scenario: Scenario): string[] {
  if (scenario === 'stable' && call.n > 9 && call.stories.includes(BLIZZARD)) {
    return call.stories.filter((s) => s !== BLIZZARD);
  }
  return call.stories;
}

// [mean, ±spread] per marker; demo.md §2 table.
type Spec = [number, number];
type TextKey = Exclude<MarkerKey, 'repeat_stories' | VoiceKey>;
type VoiceKey = 'pitch_var' | 'pitch_range';
const EARLY: Record<TextKey, Spec> = {
  speech_rate: [134, 5], pause_rate: [9.0, 1.0], mean_pause_ms: [650, 50], wfp_rate: [0.8, 0.3],
  filler_rate: [4.0, 0.5], vague_rate: [1.2, 0.2], mattr: [0.72, 0.012],
};
const DRIFT_W3: typeof EARLY = {
  speech_rate: [121, 3], pause_rate: [12.5, 0.5], mean_pause_ms: [800, 30], wfp_rate: [1.6, 0.2],
  filler_rate: [4.4, 0.4], vague_rate: [2.0, 0.2], mattr: [0.70, 0.01],
};
const DRIFT_W4: typeof EARLY = {
  speech_rate: [116, 3], pause_rate: [13.5, 0.5], mean_pause_ms: [850, 30], wfp_rate: [2.0, 0.2],
  filler_rate: [4.6, 0.4], vague_rate: [2.3, 0.2], mattr: [0.69, 0.01],
};

// Voice markers (markers.md §4b, chart only) in semitones. Drawn from their own PRNG so
// adding them leaves every transcript marker value from earlier seeds unchanged.
const VOICE_EARLY: Record<VoiceKey, Spec> = { pitch_var: [3.2, 0.2], pitch_range: [8.6, 0.5] };
const VOICE_W3: typeof VOICE_EARLY = { pitch_var: [2.9, 0.15], pitch_range: [7.9, 0.4] };
const VOICE_W4: typeof VOICE_EARLY = { pitch_var: [2.7, 0.15], pitch_range: [7.5, 0.4] };

export const MARKER_UNITS: Record<MarkerKey, string> = {
  speech_rate: 'wpm', pause_rate: 'per100w', mean_pause_ms: 'ms', wfp_rate: 'per100w',
  filler_rate: 'per100w', vague_rate: 'per100w', mattr: 'ratio', repeat_stories: 'count',
  pitch_var: 'st', pitch_range: 'st',
};

// mulberry32: small deterministic PRNG so every seed run is identical.
export function prng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Week index 1–4 for call n (three calls per week).
export const weekOf = (n: number) => Math.ceil(n / 3);

export function markersFor(n: number, scenario: Scenario, rand: () => number) {
  const week = weekOf(n);
  const table = week <= 2 || scenario === 'stable' ? EARLY : week === 3 ? DRIFT_W3 : DRIFT_W4;
  const out = {} as Record<Exclude<MarkerKey, 'repeat_stories'>, number>;
  for (const [key, [mean, spread]] of Object.entries(table) as [TextKey, Spec][]) {
    const v = mean + (rand() * 2 - 1) * spread;
    out[key] = key === 'mattr' ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
  }
  const voice = week <= 2 || scenario === 'stable' ? VOICE_EARLY : week === 3 ? VOICE_W3 : VOICE_W4;
  const vrand = prng(1000 + n);
  for (const [key, [mean, spread]] of Object.entries(voice) as [VoiceKey, Spec][]) {
    out[key] = Math.round((mean + (vrand() * 2 - 1) * spread) * 10) / 10;
  }
  return out;
}

// Wall-clock time in `tz` → UTC Date.
function zonedToUtc(y: number, m: number, d: number, h: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric',
    }).formatToParts(guess).map((p) => [p.type, p.value]),
  );
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour);
  return new Date(guess.getTime() - (shown - guess.getTime()));
}

// Calls 1–12: Mon/Wed/Fri 10:00 local over the four ISO weeks before the current one.
export function callDates(now = new Date(), tz = TIMEZONE): Date[] {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = local.split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
  const w0 = new Date(today.getTime() - dow * 86_400_000);
  const dates: Date[] = [];
  for (let week = 4; week >= 1; week--) {
    for (const offset of [0, 2, 4]) {
      const day = new Date(w0.getTime() - week * 7 * 86_400_000 + offset * 86_400_000);
      dates.push(zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 10, tz));
    }
  }
  return dates;
}
