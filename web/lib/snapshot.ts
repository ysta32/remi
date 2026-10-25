import type { CallCard } from './types';

const MAX_CAPTION = 70;

// The handwritten caption on a snapshot card. The contract has no caption field, so it is the
// first photo discussed, else the summary's first sentence (with the rest as the body).
export function snapshotCaption(call: CallCard): { caption: string | null; body: string | null } {
  const summary = call.summary?.trim() || null;
  if (call.photosShown.length > 0) return { caption: call.photosShown[0].caption, body: summary };
  if (!summary) return { caption: null, body: null };
  const first = summary.match(/^([\s\S]+?[.!?])(\s+|$)/);
  const caption = first ? first[1] : summary;
  // Handwriting is for short captions; a long sentence stays readable body text.
  if (caption.length > MAX_CAPTION) return { caption: null, body: summary };
  return { caption, body: first ? summary.slice(first[0].length).trim() || null : null };
}
