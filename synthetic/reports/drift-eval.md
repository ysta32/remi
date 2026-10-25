# Nudge rules on simulated personas

**SIMULATED DATA.** Marker-level generative model (web/scripts/sim-personas.ts), 200 seeds per persona, about 4 calls a week with 15% missed.
Drift persona: changes ramp from week 3 to week 8. Stable persona: no drift, plus one "cold" week per 8 weeks. Mood-dip persona: low mood in weeks 4–5.
These are design checks of the rules, not measured performance on real people. Real decline unfolds over months.

| Rule | Drift: detected by wk 8 | Drift: median delay (IQR), weeks from onset | Stable: any alert in 8 wk | Stable: alerts / persona-year | Stable: % weeks watching | Mood dip: cognitive alert | Mood dip: wellbeing card |
|---|---|---|---|---|---|---|---|
| Drift Index: weekly D ≥ 1.5 in 3 of 4 weeks + upward trend (new) | 92.0% | 5.0 (5–6) | 1.0% | 0.16 | 16.7% | 0.0% | 99.5% |
| SPEC §11: ≥ 2 groups at weekly z ≥ 1.5, 2 weeks in a row (current) | 93.5% | 4.0 (4–5) | 10.0% | 1.54 | —% | 22.0% | 99.5% |
| Naive: any call with a marker ≥ 2 SD (alerts counted per call) | 100.0% | 2.0 (2–2) | 99.5% | 74.30 | —% | 100.0% | —% |

Mood dip, Drift Index: the cognitive rule held but was routed to the wellbeing card in 7.0% of seeds.
Stable 52-week runs, wellbeing cards per persona-year: Drift Index 0.01, SPEC §11 0.01.

Targets from the research brief (heuristic): detection ≥ 90%, median delay ≤ 4 weeks after onset, stable ≤ 0.1 false nudges / persona-year, mood dip ≈ 0% cognitive and ≥ 80% wellbeing card.

Sensitivity of the Drift Index rule (same seeds):

| Setting | Drift detected by wk 8 | Median delay (weeks from onset) | Stable alerts / persona-year | Mood dip cognitive alert |
|---|---|---|---|---|
| default (8-call baseline, skip 2, ≥1.5 in 3 of 4) | 92.0% | 5.0 | 0.16 | 0.0% |
| threshold 1.25 | 95.5% | 5.0 | 0.31 | 0.0% |
| threshold 2.0 | 80.0% | 5.0 | 0.06 | 0.0% |
| 2 of 4 weeks | 100.0% | 4.0 | 0.80 | 0.0% |
| 2 of 3 weeks | 100.0% | 4.0 | 0.77 | 0.0% |
| 6-call baseline | 92.5% | 5.0 | 0.33 | 0.0% |
| 12-call baseline | 77.0% | 6.0 | 0.10 | 0.0% |
| no trend requirement | 94.0% | 5.0 | 0.39 | 0.0% |
| 6-call baseline, 2 of 3 weeks, threshold 1.75 | 98.0% | 4.0 | 0.80 | 1.0% |

Realistic pace (26-week runs, change ramps from week 3 to week 26):

| Scenario | Drift Index: noticed | median weeks after onset (IQR) | % of full change at note | SPEC §11: noticed | median weeks |
|---|---|---|---|---|---|
| Full-size change over 6 months | 99.5% | 11.0 (9–13.5) | 46% | 100.0% | 9.0 |
| Half-size change over 6 months | 73.5% | 17.0 (14–20) | 35% | 90.5% | 13.0 |

Sudden slowdown (12-week runs, pace drops 30 wpm from day 42 and stays down):

| Sharp-change setting | Caught | Median calls to flag | Median days | Steady: flags / year | Mood dip: flagged |
|---|---|---|---|---|---|
| Chosen: 2.5 spreads slower on 3 calls in a row | 91.0% | 3.0 | 5 | 0.20 | 2.0% |
| 2 spreads on 3 calls in a row | 96.5% | 3.0 | 4 | 0.43 | 4.5% |
| 3 spreads on 3 calls in a row | 81.5% | 3.0 | 5 | 0.09 | 0.5% |
| 3 spreads on 2 calls in a row | 87.0% | 2.0 | 2 | 0.42 | 4.0% |
| 2.5 spreads on 2 calls in a row | 94.0% | 2.0 | 2 | 0.73 | 7.0% |
| 3.5 spreads on a single call | 89.0% | 1.0 | 2 | 2.03 | 18.5% |
| 4 spreads on a single call | 87.0% | 2.0 | 2 | 1.38 | 15.0% |

| Slowdown size | Caught | Median calls | Median days | Weekly rule alone nudged |
|---|---|---|---|---|
| 20 wpm | 68.0% | 4.0 | 7 | 12.0% |
| 30 wpm | 91.0% | 3.0 | 5 | 17.0% |
| 40 wpm | 98.0% | 3.0 | 4 | 21.0% |

Example drift run (seed 0), weekly Drift Index:

| Week | Calls | Weekly D | EWMA | Watching | Nudge |
|---|---|---|---|---|---|
| 1 (baseline) | 3 | 0.51 | 0.00 |  |  |
| 2 (baseline) | 4 | 0.38 | 0.00 |  |  |
| 3 (baseline) | 4 | -0.07 | 0.25 |  |  |
| 4 | 4 | -0.18 | 0.10 |  |  |
| 5 | 4 | 0.68 | 0.45 |  |  |
| 6 | 2 | 2.43 | 1.16 | yes |  |
| 7 | 2 | 2.96 | 1.82 | yes |  |
| 8 | 4 | 3.03 | 2.53 | yes | NUDGE |
