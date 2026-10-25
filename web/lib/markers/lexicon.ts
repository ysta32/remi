// Word lists for filler and vague-word markers (markers.md §3). Pure data.

/** English single-token fillers. "like" is deliberately excluded (too ambiguous). */
export const EN_FILLER_TOKENS: ReadonlySet<string> = new Set(['um', 'uh', 'er', 'erm', 'hmm', 'mm', 'ah']);

/** English multi-token fillers, matched on the lowercase token sequence; a match consumes its tokens. */
export const EN_FILLER_PHRASES: readonly (readonly string[])[] = [
  ['you', 'know'],
  ['i', 'mean'],
];

/** English vague ("general") words. */
export const EN_VAGUE_TOKENS: ReadonlySet<string> = new Set([
  'thing', 'things', 'thingy', 'stuff', 'something', 'whatchamacallit', 'thingamajig', 'whatsit',
]);

/** Mandarin fillers, counted as non-overlapping substrings. 啊 / 然后 / 就是 excluded as too common. */
export const ZH_FILLERS: readonly string[] = ['嗯', '呃', '额', '唔'];

/**
 * Mandarin vague words, counted as non-overlapping substrings. 那个 is also an ordinary
 * demonstrative, which adds noise that the per-person baseline partly absorbs.
 */
export const ZH_VAGUE: readonly string[] = ['那个', '东西', '什么的', '那什么', '那谁'];
