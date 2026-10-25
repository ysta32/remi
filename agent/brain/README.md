# brain/

Remi's prompt, call flow, tools and safety handling. Pure modules (no LiveKit imports), so they are tested offline and can be printed with `node scripts/render-instructions.mjs [variant] [--v2]`.

- `callflow.mjs` — `buildInstructions(ctx)` and `openingInstructions(ctx)`.
- `tools.mjs` — `show_photo`, `record_consent`, `mark_family_question_asked`, `report_safety_concern` (+ `record_memory_prompt` in v2).
- `safety.mjs` — keyword backstop on caller transcripts, and the safety monitor.
- `notify.mjs` — iMessage / dispatch for family alerts (v2 only).
- `index.mjs` — `createBrain()` wires them together for `agent.mjs`.

## contractV2 (Kevin's version, off by default)

`CONTRACT_V2=1` turns on memory moments, emergency-contact alerts and safety levels from `ws/A-call-flow` (`04f3ad3`). That contract change was **not merged**: with it off, Remi only sends events main's backend accepts. To turn it on, the backend would need:

1. **CallContext** (`GET /api/agent/context`):
   - `memoryPrompts: [{ id, question, answer, hint?, askedBy }]`, pending family memory prompts.
   - `emergency: { contactName, contactPhone (E.164), mode: 'family' | '911', address? }`.
2. **Events** (`POST /api/agent/calls/:id/events`):
   - New type `memory_prompt`, payload `{ promptId, outcome: 'recalled' | 'recalled_with_hint' | 'answer_shared' | 'skipped' }`.
   - `safety` payload extended: `category` adds `fall`, `disorientation`, `exploitation`; new `level: 'watch' | 'urgent' | 'emergency'`, `source: 'model' | 'keyword'`, `notified`, `dispatched` booleans. Today the backend accepts only `medical_emergency | self_harm | other` with a note.
3. **Storage + family app**: a table for memory prompts and their outcomes, emergency-contact fields on the elder, and somewhere in the app to show safety levels.
4. **Product calls for humans**: memory moments conflict with "never quiz or test memory" (safety-and-copy), and family alerting is listed as roadmap.

## Safety alerts to a saved contact

`SAFETY_ALERT_CONTACT=grandson` sends safety alerts (feeling unwell, self-harm talk, falls,
emergencies) by iMessage to that saved contact (`npm run contacts -- add grandson <number>`),
named from the family list ("grandson" → Sam). It works with or without `CONTRACT_V2`. Each
category alerts once per call, and again only if it gets more serious. The family page shows
the check-in note on the live call card within a few seconds.
