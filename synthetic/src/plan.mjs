import { makeRng, shuffle, stableId } from './random.mjs';

const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const categories = ['new', 'unprompted', 'prompted', 'uncertain'];

function apportion(total, weights) {
  const quotas = weights.map(weight => total * weight);
  const result = quotas.map(Math.floor);
  const order = quotas.map((quota, index) => ({ index, remainder: quota - result[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = total - result.reduce((sum, n) => sum + n, 0);
  for (let i = 0; i < remaining; i++) result[order[i].index]++;
  return result;
}

// Reserve kind coverage before filling remaining shuffled slots. Uncertain's
// minimum one slot per split uses opposite kinds, so even the 2/week preset
// covers both kinds globally without demanding infeasible per-split coverage.
function placeCategories(counts, split, seed) {
  const rng = makeRng(seed, `categories:${split}`);
  const length = counts.reduce((sum, n) => sum + n, 0);
  const positions = {
    story: shuffle(Array.from({ length }, (_, i) => i).filter(i => i % 5 < 3), rng),
    question: shuffle(Array.from({ length }, (_, i) => i).filter(i => i % 5 >= 3), rng),
  };
  const remaining = [...counts];
  const result = Array(length);
  const reserve = (categoryIndex, kind) => {
    const slot = positions[kind].pop();
    if (slot === undefined || remaining[categoryIndex] < 1) throw new Error('Infeasible repeat allocation.');
    result[slot] = categories[categoryIndex + 1];
    remaining[categoryIndex]--;
  };
  reserve(2, split === 'tuning' ? 'story' : 'question');
  if (remaining[2]) reserve(2, split === 'tuning' ? 'question' : 'story');
  for (const index of [0, 1]) for (const kind of ['story', 'question']) reserve(index, kind);
  const rest = shuffle(remaining.flatMap((n, i) => Array(n).fill(categories[i + 1])), rng);
  let cursor = 0;
  for (let i = 0; i < length; i++) if (result[i] === undefined) result[i] = rest[cursor++];
  return result;
}

/** Build the UTC instant from each local calendar date, never by adding 24h to an instant. */
function startedAt(config, dayOffset) {
  const date = new Date(`${config.startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(config.localHour);
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const observed = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return new Date(2 * date.getTime() - observed).toISOString();
}

function partitionFamilies(catalog, seed) {
  if (!Array.isArray(catalog) || catalog.length !== 40) throw new TypeError('Catalog must contain 40 incidents.');
  const families = new Map();
  const ids = new Set();
  for (const entry of catalog) {
    if (!entry || typeof entry.id !== 'string' || ids.has(entry.id) || typeof entry.familyId !== 'string' || !['story', 'question'].includes(entry.kind) || !Array.isArray(entry.variants) || entry.variants.length < 3) throw new TypeError('Invalid scheduling catalog.');
    ids.add(entry.id);
    if (!families.has(entry.familyId)) families.set(entry.familyId, []);
    families.get(entry.familyId).push(entry);
  }
  const pools = { tuning: { story: [], question: [] }, heldOut: { story: [], question: [] } };
  for (const [kind, expected] of [['story', 12], ['question', 8]]) {
    const grouped = [...families.entries()].filter(([, entries]) => entries[0].kind === kind)
      .sort(([a], [b]) => lexical(a, b));
    if (grouped.length !== expected || grouped.some(([, entries]) => entries.length !== 2 || entries.some(e => e.kind !== kind))) throw new TypeError('Catalog requires homogeneous two-incident families.');
    const ordered = shuffle(grouped, makeRng(seed, `families:${kind}`));
    for (const [index, [, entries]] of ordered.entries()) {
      const split = index < expected / 2 ? 'tuning' : 'heldOut';
      pools[split][kind].push(...entries.slice().sort((a, b) => lexical(a.id, b.id)));
    }
  }
  return pools;
}

/** Finite allocation: complete family pools, introduction calls, then eligible repeat calls. */
export function planCalls(config, catalog) {
  const pools = partitionFamilies(catalog, config.seed);
  const calls = [];
  for (let weekIndex = 0; weekIndex < config.weeks; weekIndex++) {
    for (let withinWeek = 0; withinWeek < config.callsPerWeek; withinWeek++) {
      const timestamp = startedAt(config, weekIndex * 7 + config.weekdays[withinWeek]);
      const split = config.callsPerWeek === 3
        ? ((weekIndex + withinWeek) % 2 === 0 ? 'tuning' : 'heldOut')
        : (withinWeek % 2 === 0 ? 'tuning' : 'heldOut');
      calls.push({ callId: stableId('call', config.seed, timestamp), weekIndex, startedAt: timestamp, split, occurrences: [] });
    }
  }
  const totals = apportion(calls.length * 5, [0.5, 0.3, 0.15, 0.05]);
  const counts = Object.fromEntries(categories.map((key, i) => [key, totals[i]]));
  const splits = { isSimulated: true };
  let tuningRepeats;
  for (const split of ['tuning', 'heldOut']) {
    const localCalls = calls.filter(call => call.split === split);
    const half = localCalls.length / 2;
    const repeats = split === 'tuning'
      ? apportion(half * 5, [0.6, 0.3, 0.1])
      : totals.slice(1).map((total, i) => total - tuningRepeats[i]);
    if (split === 'tuning') tuningRepeats = repeats;
    const repeatCategories = placeCategories(repeats, split, config.seed);
    const selected = { story: pools[split].story.slice(0, half * 3), question: pools[split].question.slice(0, half * 2) };
    const variants = new Map();
    const rng = makeRng(config.seed, `variants:${split}`);
    for (let index = 0; index < localCalls.length; index++) {
      const call = localCalls[index];
      const introduction = index < half;
      const batch = index % half;
      const entries = [...selected.story.slice(batch * 3, batch * 3 + 3), ...selected.question.slice(batch * 2, batch * 2 + 2)];
      call.occurrences = entries.map((entry, slot) => {
        const category = introduction ? 'new' : repeatCategories[(index - half) * 5 + slot];
        const variantIndex = introduction ? Math.floor(rng() * entry.variants.length) : (variants.get(entry.id) + 1) % entry.variants.length;
        variants.set(entry.id, variantIndex);
        return {
          occurrenceId: stableId('occurrence', call.callId, slot), incidentId: entry.id,
          familyId: entry.familyId, kind: entry.kind, category,
          elicitation: category === 'new' ? 'unprompted' : category, variantIndex,
        };
      });
    }
    splits[split] = {
      callIds: localCalls.map(call => call.callId),
      familyIds: [...new Set([...pools[split].story, ...pools[split].question].map(entry => entry.familyId))].sort(lexical),
    };
  }
  return { calls, counts, splits };
}
