# Kickoff — how humans start the agents

## One-time setup (one person, ~5 minutes)

```bash
mkdir echo && cd echo && git init -b main
# copy CLAUDE.md, SPEC.md, and docs/ from this bundle into the repo root
git add -A && git commit -m "[docs] spec, contracts, workstream briefs"
gh repo create echo-hackpsu --public --source=. --push   # or create on github.com and push
```

Each person clones the repo. To run more than one agent on one laptop without them overwriting each other's working files, give each lane its own worktree:

```bash
git worktree add ../echo-A -b ws/a-agent
git worktree add ../echo-BC -b ws/bc-backend
git worktree add ../echo-D -b ws/d-app
```

Open Claude Code in the lane's directory (`cd ../echo-A && claude`) and paste that lane's prompt. Secrets: each human creates `.env.local` files themselves; never paste keys into the chat.

Suggested mapping: Engineer 1 → A · Engineer 2 → B, then C in a second session once B0 is pushed · Engineer 3 → D (+ Devpost/video).

---

## Prompt — Workstream A (call agent)

```
You are the Workstream A agent for Echo. Read CLAUDE.md, then docs/workstreams/A-call-agent.md, then the sections of SPEC.md, docs/contracts.md and docs/safety-and-copy.md it lists, then docs/HANDOFF.md.

Start with task A0 (go/no-go). You cannot place FaceTime calls or see my screen: whenever a step needs me (installing the Chert CLI, logging in, filling .env.local, running chert dev, calling the line), give me exact numbered steps and wait for my report. Before writing code against @livekit/agents, read its installed type definitions and tell me which APIs you verified.

Work task by task. After each acceptance gate, update the A section of docs/HANDOFF.md, commit with prefix [A], and stop to report.
```

## Prompt — Workstream B (backend)

```
You are the Workstream B agent for Echo. Read CLAUDE.md, then docs/workstreams/B-backend.md, docs/contracts.md in full, and SPEC.md sections 7, 8 and 12, then docs/HANDOFF.md.

Do B0 (scaffold) first and fast: the other agents are waiting on it. Push it to main and tell me so I can notify the team. Then continue B1–B6 in order. Implement contracts exactly; use stubs for C's pipeline until it lands. Never print or read env file contents.

After each acceptance gate, update the B section of docs/HANDOFF.md, commit with prefix [B], merge to main when green, and stop to report.
```

## Prompt — Workstream C (analysis)

```
You are the Workstream C agent for Echo. Read CLAUDE.md, then docs/workstreams/C-analysis.md, docs/markers.md in full, docs/contracts.md sections 2, 3 and 7, docs/safety-and-copy.md section 5, and SPEC.md sections 9–11, then docs/HANDOFF.md.

Start with C1: the pure markers library and the test vectors in docs/markers.md. Tests first; they must match the expected numbers exactly. Verify any provider model names and options against current documentation before using them, and record what you used. Never make claims about diagnosis anywhere, including comments.

After each acceptance gate, update the C section of docs/HANDOFF.md, commit with prefix [C], merge to main when green, and stop to report.
```

## Prompt — Workstream D (family app + demo)

```
You are the Workstream D agent for Echo. Read CLAUDE.md, then docs/workstreams/D-family-app.md, docs/demo.md in full, docs/safety-and-copy.md sections 2–3, docs/contracts.md sections 3, 5 and 6, and SPEC.md sections 13–14, then docs/HANDOFF.md.

Start with D0 and D1 against fixtures while B scaffolds the API. Keep the design warm and calm, never clinical, and badge every simulated item. Remind me that the public GitHub repo and Devpost project must exist before midnight Saturday.

After each acceptance gate, update the D section of docs/HANDOFF.md, commit with prefix [D], merge to main when green, and stop to report.
```

## Prompt — Integration / QA (start ~7 AM Sunday, on main)

```
You are the integration agent for Echo. Read CLAUDE.md, SPEC.md section 15, docs/demo.md sections 3 and 5, and docs/HANDOFF.md. Do not add features.

Run the end-to-end loop with me: reset + seed drift, I place a FaceTime call, you check /api/dev/status, the timeline payload, pipeline timings, and logs. Record each run (pass/fail, latency, issues) in the Project status section of HANDOFF. For each failure, find the smallest fix in the owning lane, show me the diff, and only apply it with my approval. Also audit all UI copy, prompts, and README against the claims policy in docs/safety-and-copy.md and list any violations.
```

## Prompt — Pitch/Devpost helper (any time after midnight)

```
Read SPEC.md sections 0, 1.3, 18 and 20, docs/safety-and-copy.md section 1, and docs/demo.md sections 4 and 7. Draft the Devpost write-up (inspiration, what it does, how we built it, challenges, accomplishments, what we learned, what's next) and a 5-minute video script. Use only approved claims, state clearly what is simulated, and cite the sources listed. Put drafts in docs/devpost-draft.md.
```
