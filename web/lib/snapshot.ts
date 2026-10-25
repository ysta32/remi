import type { CallCard } from './types';

// The handwritten caption on a snapshot card. The contract has no caption field, so it is the
// first photo discussed, else the summary's first sentence (with the rest as the body).
export function snapshotCaption(call: CallCard): { caption: string | null; body: string | null } {
  const summary = call.summary?.trim() || null;
  if (call.photosShown.length > 0) return { caption: call.photosShown[0].caption, body: summary };
  if (!summary) return { caption: null, body: null };
  const first = summary.match(/^(.+?[.!?])(\s+|$)/s);
  if (!first) return { caption: summary, body: null };
  return { caption: first[1], body: summary.slice(first[0].length).trim() || null };
}
