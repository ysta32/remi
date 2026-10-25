// Prompts for post-call extraction and the story-matching fallback.
// Rules come from echo-docs/echo-docs/docs/safety-and-copy.md §1 and §5.
import { APP_NAME } from '@/lib/config';
import type { Lang, Utterance } from '@/lib/types';

export interface ExtractionPromptContext {
  preferredName: string;
  language: Lang;
  askedQuestions: { id: string; text: string; askedBy: string }[];
  /** True when the call had a logged safety event (call_events type 'safety'). */
  hadSafetyEvent?: boolean;
}

const LANGUAGE_NAME: Record<Lang, string> = { en: 'English', zh: 'Mandarin Chinese' };

export const SAFETY_SUMMARY_LINE = `Part of the call touched on a hard moment; ${APP_NAME} shared support resources.`;

/** One line per utterance: "Caller: …" / "Agent: …". */
export function formatTranscript(utterances: Utterance[]): string {
  return utterances
    .filter((u) => u.text.trim().length > 0)
    .map((u) => `${u.speaker === 'caller' ? 'Caller' : 'Agent'}: ${u.text.trim()}`)
    .join('\n');
}

export function buildExtractionSystemPrompt(ctx: ExtractionPromptContext): string {
  const name = ctx.preferredName;
  const lang = LANGUAGE_NAME[ctx.language];
  const questions =
    ctx.askedQuestions.length === 0
      ? 'No family questions were asked in this call. Return an empty familyQuestionAnswers array and set every funFacts[].questionId to null.'
      : [
          'Family questions asked in this call (use these exact ids):',
          ...ctx.askedQuestions.map((q) => `- id "${q.id}" (asked by ${q.askedBy}): ${q.text}`),
        ].join('\n');

  return `You write the after-call notes for ${name}'s family. ${name} just had a friendly video call with ${APP_NAME}, a conversational companion. In the transcript, "Caller:" lines are ${name} and "Agent:" lines are ${APP_NAME}. ${name} speaks ${lang}.

Your readers are ${name}'s loved ones. They want to feel close to ${name} and hear what was talked about. Return JSON that matches the provided schema.

summary
- 3 to 5 sentences, past tense, warm and specific: name the people, places, years and objects ${name} talked about.
- Write it in English and refer to the caller as "${name}".
- No clinical or medical vocabulary, no guesses about health, memory or mood beyond what the caller plainly said, and nothing about how the caller spoke (pace, pauses, word choice, repeating himself).
- No direct quote longer than one sentence.
- At most 900 characters.

funFacts (0 to 4)
- Concrete, delightful details the caller shared, e.g. "${name}'s first car was a 1957 Chevy Bel Air he bought for $300."
- text: one English sentence, at most 200 characters.
- quote: the caller's own words supporting the fact, copied from a Caller line in the original language (${lang}), at most 200 characters. Never quote the agent.
- questionId: the id of the family question the fact answers, or null.
- Skip anything vague, sad or private (illness, money worries, conflicts). Fewer good facts beat many weak ones.

topics (0 to 8)
- kind "story": a memory or anecdote the caller told. kind "question": a family question the caller answered.
- summary: one short English line, at most 140 characters, specific enough to recognise the same story told again on another day (e.g. "The 1977 blizzard when the roundhouse roof caved in under the snow").
- initiatedBy: whoever brought the story up first. "caller" if ${name} raised it unprompted; "agent" if ${APP_NAME} asked about it, showed a photo of it, or relayed a family question that led to it.

mood
- label positive, neutral or low, and score from -1 (low) to 1 (positive), based only on how the caller described their own day and feelings in the call. This is a light wellbeing check-in, not an assessment.
- evidence: up to 3 short paraphrases of what the caller said (each at most 160 characters).

familyQuestionAnswers
${questions}
- Include an entry only for a question the caller actually answered. answer: a short English answer in your words, at most 300 characters.

safetyMentioned
- true only if, during this call, the caller raised a present-day risk to themselves (thoughts of self-harm, or a medical emergency happening now) or the agent shared 911, 988 or other crisis resources. Memories of past illnesses, accidents or losses are NOT safety moments; set false for those.

Hard moments${ctx.hadSafetyEvent ? ' (a safety event was logged during this call)' : ''}
- If safetyMentioned is true${ctx.hadSafetyEvent ? ' (it must be true for this call)' : ''}, the summary must be exactly this sentence and nothing else: "${SAFETY_SUMMARY_LINE}" Return empty funFacts and familyQuestionAnswers, and leave every detail of that moment out of topics and mood evidence.

Never use the words diagnose, detect, screen, dementia, Alzheimer's, cognitive, decline or symptom.`;
}

export function buildExtractionUserPrompt(utterances: Utterance[]): string {
  return `Transcript:\n${formatTranscript(utterances)}`;
}

export function buildRetryNote(validationError: string): string {
  return `Your previous reply did not match the required format. Fix these problems and reply again with the full JSON:\n${validationError}`;
}

export const MATCH_SYSTEM_PROMPT = `You compare short summaries of stories an older person told on different calls. For each new story, decide whether it is the SAME specific story as one of the earlier stories: the same event, told again, possibly in different words. Stories that only share a theme (two different cars, two different winters) are not the same story. Return the id of the matching earlier story, or null if none matches. Use only ids from the lists given.`;

export function buildMatchUserPrompt(
  newStories: { id: string; summary: string }[],
  candidates: { id: string; summary: string }[],
): string {
  const list = (xs: { id: string; summary: string }[]) =>
    xs.map((s) => `- id "${s.id}": ${s.summary}`).join('\n');
  return `New stories:\n${list(newStories)}\n\nEarlier stories:\n${list(candidates)}`;
}
