// Nudge copy, verbatim from docs/safety-and-copy.md §3. Never add numbers to this text.
import type { NudgeReason } from '../types';

export const CHECKUP_LINK = 'https://www.alz.org/alzheimers-dementia/10_signs';
export const CHECKUP_LINK_LABEL = "Alzheimer's Association: 10 warning signs";

/** "a", "a and b", "a, b, and c". */
export function joinNaturally(items: string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? '';
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`;
}

export function renderNudge(
  type: 'cognitive_checkup' | 'wellbeing',
  name: string,
  reason: Pick<NudgeReason, 'plainLanguage'> | null,
): { message: string; link: string | null } {
  if (type === 'wellbeing') {
    return {
      message: `${name} has sounded a bit low in several of our recent chats. A call or visit from family can mean a lot. If you're worried about his mood, his doctor is a good person to talk to.`,
      link: null,
    };
  }
  const list = joinNaturally(reason?.plainLanguage ?? []) || 'a few small changes';
  return {
    message: `Over the last couple of weeks, a few things about how ${name} talks in our chats have shifted compared with his usual: ${list}. This isn't a diagnosis — tiredness, a cold, hearing, new medications, or mood can all cause changes like these. It might be a good time to check in with him, and to mention it at his next doctor's visit.`,
    link: CHECKUP_LINK,
  };
}
