---
target: home page sketch
total_score: 23
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 3
target_identity: "file:/Users/jimmyc803/Desktop/Projects/remi/web/.impeccable/mocks/home-snapshots.html"
target_fingerprint: "sha256:c4a829713abff6b9fb9502be3ed22973c085a5af72573511dc6b8c32bf7cc142"
target_path: /Users/jimmyc803/Desktop/Projects/remi/web/.impeccable/mocks/home-snapshots.html
timestamp: 2026-10-25T02-22-42Z
slug: impeccable-mocks-home-snapshots-html
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | No "simulated demo" or "call now" cue; live dot unexplained |
| 2 | Match System / Real World | 3 | "Grandpa" vs the reader's "Dad" |
| 3 | User Control and Freedom | 3 | |
| 4 | Consistency and Standards | 2 | Two labels for one CTA; butter = stories AND health note |
| 5 | Error Prevention | 3 | |
| 6 | Recognition Rather Than Recall | 3 | |
| 7 | Flexibility and Efficiency | n/a | single-path persuade page |
| 8 | Aesthetic and Minimalist Design | 2 | Equal-lightness surfaces; nothing leads after hero |
| 9 | Error Recovery | 2 | Gradient photo placeholder reads as a failed image |
| 10 | Help and Documentation | 3 | |
| Total | | 23/36 | |

## Design Specificity Verdict
Half authored: hero specific (Hal, Remi bubble, NEW snapshot); below-fold sections generic (step cards, 4 tiles, 2 promise cards, footer). Detector: home clean (0, one config-suppressed tight-leading 1.29x); assigned.html: text-occlusion, NEW tag behind .snap (real; stacking order). All text contrast passes AA (ink 9-13:1, ink2 5.0-5.5:1). assigned.html lacks viewport meta.

## Priority Issues
- [P0] No responsive layout: 390px scrolls sideways ~140px, illustration 51px wide, nav wraps, CTA below fold. Fix: stacked mobile hero, one-pill nav, single-column sections. (/impeccable adapt)
- [P1] Colour has no value hierarchy (butter vs sky 1.03:1, cards vs ground ~1.08) and is cold against a warm golden illustration. (/impeccable colorize)
- [P1] Gradient placeholder "photo" reads as broken image. Use a spot illustration or an honest flat "developing" state.
- [P1] Page tells, never shows: add a full readable snapshot card, one sample "How he's doing" row, a Simulated badge. (/impeccable bolder)
- [P2] Accent role collision (butter = joy + health note); Patrick Hand outside caption role; sub-17px text; ~8 type sizes vs contract's 3. (/impeccable typeset)
- [P3] Timeline sketch: gentle note above the story (inverts stories-first); NEW tag z-index bug.

## Colour alternatives
A Sunroom (pick): ground #fbf6ec, surface #fff + #efe4cf hairline, ink #1f2d4a, ink2 #5a5f6e, terracotta #e8845c fill / #a9502f text (family, NEW, fun facts; never on health notes), butter #f6d77a (joy only), sage #cfe5d6 / #3e6b55, sky #cfe2f3 (data layer only), data line #3b5583.
B Brighter Sky: ground #e7f0f8, hero #a9cdee, surfaces #fff, ink #1d2b45, butter #ffd668, peach #ffb595, mint #a8dcc1.
C Navy & Marigold: ground #fffaf2, navy hero band #22314a, cream text #fff6e6, marigold #ffc94a, peach #ffb59a, sage #9ccbb0.

## Persona Red Flags
- Adult child on phone: sideways scroll, Hal vanishes, CTA below fold; timeline puts health note before story.
- Judge, 30 s: never sees output; eyebrow spent on "HackPSU Fall 2026"; no Simulated label; no link to the live call.
- 70-year-old relative: 16-18px grey handwriting, edgeless white-on-near-white cards; bare signal list may feel like surveillance without "his own usual" framing.

## Minor Observations
"Pauses" should be "Pauses & hesitation"; illustration PNG has white fringe on leaves and glow above phone; footer research line should name I-CONECT; flat ending, no closing CTA; step (#fffdf9) vs signal (#fff) surfaces differ imperceptibly.

## Questions to Consider
- If warm = stories and cool = signals everywhere, could colour alone say "trends are the quiet second layer"?
- Why does the hero describe a snapshot instead of being one?
- Is "Grandpa" right when the reader calls him "Dad"?
