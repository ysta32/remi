// The brain seam: everything Remi knows and can do on a call, with no LiveKit or HTTP.
// agent.mjs (voice), scripts/chat.mjs (text) and scripts/simulate-call.mjs import only
// this, so all three behave the same. CONTRACT_V2 switches Kevin's extended features.
import { buildInstructions as buildCallInstructions, openingInstructions } from './callflow.mjs';
import { createSafetyMonitor, resolveSafetyConfig, screenText } from './safety.mjs';
import { createCallFlowTools } from './tools.mjs';
import { contactsSection, createMessagingTools } from './messaging.mjs';
import { createContactBook } from '../lib/contacts.mjs';

export { openingInstructions, screenText };

// Voice-call habits the call-flow prompt leaves implicit. These came from live tests:
// long answers (a times table) can't be interrupted gracefully on FaceTime.
const VOICE_RULES = `ON THE PHONE
- This is a live voice call. Never read out lists, tables, or long passages. Give a small piece, then ask if they want more.
- Keep every turn under about 30 words unless they ask you to tell a story.
- If they say "stop", "wait", or start talking over you, stop and listen to them.
- If you didn't catch something, say so briefly and ask them to say it again.
- Remember what they told you earlier in this call and bring it back naturally.`;

// Anyone can FaceTime the line, so the caller may not be the person this context is about.
const otherCaller = (name) => `IF THE CALLER IS NOT ${name.toUpperCase()}
- Anyone can call this number. If the caller says they aren't ${name}, or says another name, apologize lightly, ask their name, and use it from then on.
- Then just be a warm, friendly companion for them: ask about their day and what they enjoy. Ignore the agenda, photos, and family question above.
- Never share anything about ${name} or their family with someone else: no memories, names, stories, or details from WHAT YOU KNOW.
- Don't call record_consent, show_photo, mark_family_question_asked, or save_contact for them, and don't text ${name}'s contacts for them. SAFETY still applies to anyone.`;

/** System instructions for one call. */
export function buildInstructions(ctx, { contractV2 = false, now = new Date(), env = process.env, book = contactBookFor(ctx) } = {}) {
  const safety = resolveSafetyConfig(ctx, contractV2 ? env : {});
  const name = ctx.elder.preferredName;
  return `${buildCallInstructions(ctx, { safety, contractV2, now })}\n\n${contactsSection(book, name)}\n\n${VOICE_RULES}\n\n${otherCaller(name)}`;
}

/** The elder's saved numbers (lib/contacts.mjs). */
export const contactBookFor = (ctx, opts) => createContactBook(ctx.elder.id, opts);

/**
 * Tools plus the safety monitor that backs report_safety_concern.
 * @param {object} o
 * @param {object} o.ctx            CallContext
 * @param {(event: object) => void} o.emit   gated, fire-and-forget event sender
 * @param {() => number} o.elapsedMs
 * @param {(photo: object) => void} [o.onShowPhoto]
 */
export function createBrain({ ctx, callId = null, emit, elapsedMs, contractV2 = false, onShowPhoto, env = process.env, book = contactBookFor(ctx), send }) {
  const safety = createSafetyMonitor({ ctx, callId, postEvent: emit, elapsedMs, contractV2, env: contractV2 ? env : {} });
  const tools = [
    ...createCallFlowTools({ postEvent: emit, elapsedMs, safety, contractV2, photos: ctx.photos ?? [], onShowPhoto }),
    ...createMessagingTools({
      book, elderName: ctx.elder.preferredName, callId, send, env,
      dryRun: env.TEXT_DRY_RUN === '1' || env.MOCK_CONTEXT === '1',
    }),
  ];
  return {
    safety,
    tools,
    /** Keyword backstop on each final caller line. */
    safetyCheck: (text) => safety.screenCallerText(text),
  };
}

/** Who Remi is talking to when neither the backend nor the cache answered. */
export function fallbackContext({ elderId = 'unknown', language = 'en' } = {}) {
  return {
    elder: { id: elderId, displayName: 'friend', preferredName: 'friend', language, timezone: 'America/New_York', about: '' },
    family: { primaryContactName: 'your family', members: [] },
    consent: {
      proposed: { summaries: true, funFacts: true, speechTrends: true, mood: true },
      elderConfirmed: true,
      effective: { summaries: false, funFacts: false, speechTrends: false, mood: false },
    },
    lastCall: null,
    knownFacts: [],
    recentStories: [],
    photos: [],
    familyQuestion: null,
    theme: { id: 'fallback', title: 'A good day', prompt: "What's something that made you smile recently?" },
    isFirstCall: false,
    demoMode: false,
    fallback: true,
  };
}
