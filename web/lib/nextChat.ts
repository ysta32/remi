// Rules for the "For Hal's next chat" panel: what to show and what to check before saving.
// The API checks the same things; these give a friendly message before the upload starts.
import type { ElderProfile } from './api';

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // matches MAX_UPLOAD_BYTES on the server
const MAX_QUESTION = 500;

export function splitShown<T>(items: T[], n: number): { shown: T[]; more: number } {
  return { shown: items.slice(0, n), more: Math.max(0, items.length - n) };
}

// Remi asks the oldest waiting question first; answered and already-asked ones drop off.
export function waitingQuestions(questions: ElderProfile['questions']): ElderProfile['questions'] {
  return questions.filter((q) => q.status === 'pending');
}

export function checkQuestion(text: string, askedBy: string): string | null {
  if (!text.trim()) return 'Type a question for Hal first.';
  if (!askedBy.trim()) return 'Say who’s asking.';
  if (text.trim().length > MAX_QUESTION) return `Keep it under ${MAX_QUESTION} characters.`;
  return null;
}

export function checkPhoto(file: { name: string; type: string; size: number }, caption: string): string | null {
  if (/\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type)) {
    return 'That’s an iPhone HEIC photo. Please send it as a JPEG (iPhone: Settings › Camera › Formats › Most Compatible) and try again.';
  }
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') return 'Please choose a JPEG or PNG photo.';
  if (file.size > MAX_PHOTO_BYTES) return 'That photo is over 8 MB. Try a smaller one.';
  if (!caption.trim()) return 'Add a short caption so Remi knows what it shows.';
  return null;
}
