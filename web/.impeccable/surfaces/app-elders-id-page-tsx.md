---
version: 1
slug: "app-elders-id-page-tsx"
primary_target: "app/elders/[id]/page.tsx"
related_targets: ["app/page.tsx"]
---

# Surface brief: family timeline + home

Scope: `/elders/[id]` (Operate: the family member's check-in on Dad) and `/` (Persuade: welcome page for judges and new families; opens Hal's chats).
Audience: adult child on a phone between other things (primary); judges on a laptop at the expo (secondary).
Job: enjoy Dad's latest stories first; notice gently if it may be time to check in.
Constraints: contract shapes unchanged; approved copy verbatim; Simulated badges; no transcripts; no red; nudge text has no numbers; 4 signals shown (pauses & hesitation, speaking pace, vague words, retold stories); nothing overlaps anything (user rule); no dead zones, not cramped.
Spec: docs/superpowers/specs/2026-10-24-remi-family-frontend-design.md (this brief follows it).
Approved sketch: `.impeccable/mocks/home-snapshots.html` — the user approved this home layout (Brighter Sky, armchair illustration) on Oct 24; it is the critique reference for this code-led build.

## Direction contract

THESIS: Every chat with Dad lands like a fresh instant photo, stories first and health second. Refuses the white wellness dashboard of status tiles and a chart grid.

OWN-WORLD: B · Brighter Sky. Ground #e7f0f8, hero panel #a9cdee, sky-soft #d6e8f8 (usual bands, photo stand-ins, calm cards), white cards with 1px #e3ebf3 lines and neutral shadows, ink #1d2b45. Accents with jobs: butter #ffd668 joy only (the "stories" highlight, sun glyph), peach #ffd9c7/#ffb595 family and NEW, mint #a8dcc1 good spirits and privacy. Figtree for everything readable; Patrick Hand only for short snapshot captions (70 chars max). Round pills, 28–40px radii.

STORY: The family member sees Dad's newest chat as a snapshot, the gentle note right below it, earlier chats beside questions and fun facts; a second tab shows four signals in plain words ("About his usual" / "Different from his usual lately"). The judge sees the hero, then the live Today row, then how it works.

FIRST VIEWPORT: Home (1440): nav (wordmark, How it works, Privacy, See Hal's chats); sky hero panel, headline left "Grandpa calls. Remi listens. You get his stories.", navy pill CTA, judges line; Hal-in-armchair illustration right with Remi's bubble beside his phone (above it on phones); the Today row starts below. Timeline: "Hal's chats", subtitle, Chats | How he's doing tabs, then a two-column grid: newest snapshot + gentle note left, waiting questions + fun facts right.

FORM: Instant Snapshots, position 7 of 7 on the grounded list (assigned by the roll). Signature move: a newly arrived call develops from grey into colour and keeps a NEW tag for 8 s after it is seen. seed: none (reference not captured — the roll's output was read truncated to 150 lines, so whether it printed a SEED REFERENCE is unknown; roll key not committed)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
