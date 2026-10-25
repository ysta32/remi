# Call flow — what Remi says and asks

Owner: Workstream A. Code: `agent/callflow.mjs` (script + prompt), `agent/safety.mjs` (red flags), `agent/notify.mjs` (iMessage + dispatch), `agent/tools.mjs` (tool specs). Print the rendered prompt with `node agent/scripts/render-instructions.mjs [returning|first-call|demo|no-contact]`.

## 1. Order of a call

| # | Step | Example | Notes |
|---|---|---|---|
| 1 | Greeting (Remi speaks first) | "Hi Hal, it's Remi! Last time you told me about the '78 blizzard. How's your day been?" | Spoken on `bridge_ready` via `openingInstructions(ctx)`. Chert ends the call if the agent is silent for 10 s, so Remi does not wait for "hello". |
| 2 | Sharing (first call only) | "After each call I can send your family a short note… is that okay?" | Also states: "If anything ever sounds like an emergency, I'll let Linda know right away." → `record_consent` |
| 3 | Day check-in | "What did you get up to today?" · "Did you get outside or see anyone?" · "What did you have to eat?" · "How are you feeling — sleeping alright?" | 2–3 of these, conversationally, with follow-ups. These answers are where most red flags surface. |
| 4 | Theme + photo | "Here's you with your first car in 1962 — where did you drive it?" | `show_photo` |
| 5 | Memory moments | "Linda wanted me to ask: where did you and Dorothy go on your honeymoon?" | Family-supplied question **with answer and optional hint**. Up to 2 per call (1 in demo mode). → `record_memory_prompt` |
| 6 | Family question | "Sam was wondering — what was your first car?" | Once, credited. → `mark_family_question_asked` |
| 7 | Free talk → wrap-up | "I loved hearing about the shops. Call me anytime." | ~8 min (2 in `DEMO_MODE`) |

**Safety overrides every step.**

## 2. Memory moments

Family adds `{ question, answer, hint?, askedBy }`. Remi asks it as conversation, not a test:

1. Remembers → celebrate, invite more.
2. Unsure → offer the hint.
3. Still unsure → tell the answer as a little story ("Linda told me it was Niagara Falls — what do you remember about it?").

Remi never says "wrong", "try again", or "you should remember", and stops for the day if the caller seems tired or upset. The outcome (`recalled` · `recalled_with_hint` · `answer_shared` · `skipped`) is logged as a `memory_prompt` event.

This is a deliberate, human-approved exception to the earlier "never quiz memory" rule (see HANDOFF decisions log). Family-facing copy calls these "memory moments", never a test or a score.

## 3. Red flags and escalation

| Level | Meaning | Examples | Family iMessage | `SAFETY_MODE=911` adds |
|---|---|---|---|---|
| `emergency` | Danger right now | can't breathe, chest pain, stroke signs, fell and can't get up, intent to self-harm | **Immediately**: "URGENT from Remi…" | POST to `EMERGENCY_DISPATCH_URL` (if set); text tells family to call 911 for them, with address |
| `urgent` | Family should check in today | fell but is up, doesn't know where they are, scam / gift cards, not eating, wish to die without a plan | **Immediately**: "Remi check-in alert…" | — |
| `watch` | Worth noting | lonely, a bit achy | No (logged only) | — |

Minimum level that texts is `SAFETY_NOTIFY_MIN_LEVEL` (default `urgent`).

Two triggers, one path (`safety.report`):
- **Model**: calls `report_safety_concern(category, level, note)` before replying.
- **Keyword backstop**: `screenCallerText()` on each final caller transcript line. First-person, present-tense phrases only ("I can't get up", "my chest hurts"); stories like "I fell in love…" or "Dad had chest pains in '79" don't fire.

What Remi says: emergency → "Hal, this sounds serious. Please hang up and call 911 right now." plus "I'm letting Linda know" (only if the text was actually queued). Self-harm → 988 (call or text) and 911 if in danger now. Remi **never** says it called 911 or that help is coming.

Dedup: one text per category per call; a later, higher level in the same category texts again. Retries reuse the same idempotency key.

### About "call 911 immediately"

Neither Chert nor any SDK in this repo can place a phone call, and auto-dialing 911 from software is not something we can do reliably or legally this weekend. `SAFETY_MODE=911` therefore means:
1. the family text says **"Please call 911 for Hal now"** with the address on file, and
2. if `EMERGENCY_DISPATCH_URL` is set, an emergency payload is POSTed there, so a real dispatch provider can be wired in later in one place (`dispatchEmergency` in `agent/notify.mjs`).

Remi always tells the caller to call 911 themselves too.

## 4. Configuration

| Var | Default | Meaning |
|---|---|---|
| `SAFETY_MODE` | `family` | `family` or `911` (see above). Overrides `context.emergency.mode`. |
| `EMERGENCY_CONTACT_PHONE` | from context | E.164, e.g. `+18145550199`. Use a teammate's phone for demos. |
| `EMERGENCY_CONTACT_NAME` | from context / primary contact | Name Remi says ("I'm letting Linda know"). |
| `ELDER_ADDRESS` | from context | Included in emergency texts and dispatch. |
| `SAFETY_NOTIFY_MIN_LEVEL` | `urgent` | `watch` \| `urgent` \| `emergency` |
| `EMERGENCY_DISPATCH_URL`, `EMERGENCY_DISPATCH_TOKEN` | unset | Dispatch webhook for `911` mode. |
| `MEMORY_PROMPTS_PER_CALL` | `2` | Pass as `maxMemoryPrompts` to `buildInstructions`. |
| `CHERT_BASE_URL`, `CHERT_API_KEY` | — | Required for iMessage alerts (already in `env.local.template`). |

## 5. Wiring into `agent.mjs` (once the Chert starter is generated)

```js
import { buildInstructions, openingInstructions } from './callflow.mjs';
import { createSafetyMonitor } from './safety.mjs';
import { createCallFlowTools } from './tools.mjs';

const safety = createSafetyMonitor({ ctx, callId, postEvent, elapsedMs });
const instructions = buildInstructions(ctx, {
  safety: safety.config,
  maxMemoryPrompts: Number(process.env.MEMORY_PROMPTS_PER_CALL ?? 2),
});
const specs = createCallFlowTools({ postEvent, elapsedMs, safety });
// Wrap each spec with the @livekit/agents tool helper (verify its name and
// signature in node_modules first), and pass them to the voice Agent.
// On bridge_ready: generate one reply with openingInstructions(ctx).
// On each final caller transcript item: safety.screenCallerText(text).
// In the shutdown callback: await safety.flush() before exiting.
```

## 6. Tests

`node --test agent/test/` — keyword hits and misses, escalation and dedup, `911` mode, missing contact, prompt variants, and tool behavior. No network: senders are injected.
