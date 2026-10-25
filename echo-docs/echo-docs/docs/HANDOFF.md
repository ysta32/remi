# HANDOFF — shared status board

Each agent edits **only its own section** plus appends to "Requests" and "Contract changes". Keep entries short and current; replace stale lines rather than appending forever. Times in ET.

## Project status
- Go/no-go (Chert FaceTime): _pending_ (A0, due 9:30 PM Sat)
- GitHub public repo: _link_ · Devpost project: _link_ (both due before midnight Sat)
- End-to-end runs from reset (target 10 in a row): _0/10_
- Feature freeze: 10:00 AM Sun · Stable submit: 11:30 AM Sun

## A — Call agent
- Status: call flow written as standalone modules (`agent/callflow.mjs`, `safety.mjs`, `notify.mjs`, `tools.mjs`); Chert starter (`agent.mjs`) not generated yet. See `docs/call-flow.md`.
- How to run: `node agent/scripts/render-instructions.mjs [returning|first-call|demo|no-contact]`; `node --test agent/test/`
- Verified APIs (package@version → names used): none yet. Tool specs are plain JSON Schema; wrap with the @livekit/agents tool helper after checking node_modules.
- Live test results (date/time, call type, two-way audio, video, hangup, second call, latency):
- Mocked / not yet real: iMessage alert path uses `chert-sdk imessage send` (same as tools/chert-agent.mjs), untested against the live service; dispatch webhook has no provider.
- Known issues: tests not yet run (no Node on the machine they were written on). Greeting is on `bridge_ready` per Chert beta.10 AGENTS.md, which supersedes SPEC §5.5 "caller speaks first".

## B — Backend
- Status:
- Endpoints done:
- Smoke test:
- Stubs in place:
- Known issues:

## C — Analysis
- Status:
- Providers + models in use:
- Pipeline timings (per step, typical):
- Tuned thresholds (e.g., REPEAT_COSINE = ?, results on repeat-pairs):
- Known noise sources:
- Known issues:

## D — Family app + demo
- Status:
- Pages done:
- Seed results (drift → nudge? stable → none?):
- Screenshots: `fixtures/demo/screenshots/`
- Known issues:

## Requests (from → to: what, by when)
- A → B: `memory_prompts` table + endpoints, emergency columns on `elders`, extended `safety_events`, `memory_prompt` event side effects, and `memoryPrompts` / `emergency` in `/api/agent/context` (contracts §2–5).
- A → D: setup/manage UI for memory moments (question, answer, hint, asked by) and emergency contact (name, phone, family/911 mode, address).

## Contract changes (date time — change — affected workstreams)
- Sat Oct 24 — Additive: CallContext `memoryPrompts?`, `emergency?`; CallEvent `memory_prompt`; safety categories `fall`/`disorientation`/`exploitation` + `level`/`source`/`notified`/`dispatched`; `memory_prompts` table; emergency columns on `elders`; safety env vars — A, B, D

## Decisions log (human-confirmed only)
- Sat Oct 24 ~6:14 PM — Team committed to the elder FaceTime conversation + memory + family loop project.
- Sat Oct 24 ~8:25 PM — FaceTime-first flow replaces iMessage voice notes as the primary channel.
- Sat Oct 24 — Call flow: Remi greets first and asks about the caller's day; family-supplied "memory moments" (question + answer + hint, asked gently) are allowed, an exception to "never quiz memory"; red flags immediately iMessage the emergency contact (replaces "automatic family alerting is roadmap"), with a `911` mode. See `docs/call-flow.md`.
