# Speech markers, baseline, and drift

Owner: Workstream C. Implementation: `web/lib/markers/` (pure functions, no I/O) and `web/lib/analysis/` (baseline, repetition, nudges). All thresholds and word lists live in `web/lib/analysis/config.ts` and `web/lib/markers/lexicon.ts`.

These are **interpretable observations** motivated by speech-and-dementia research (speech rate and pauses, filler and "empty" words, lexical diversity, repetition). They are `[HEURISTIC]` engineering definitions, not validated clinical measures. Each person is compared only with their own baseline. Never call any output a score, risk, or diagnosis in UI copy.

---

## 1. Inputs

`computeMarkers(utterances: Utterance[], lang: Lang): MarkerResult[]`

Use **caller** utterances only. Agent utterances are used solely to exclude caller "pauses" that are actually the agent talking.

- `words` present on caller utterances (from post-call STT) → full metric set.
- `words` absent (transcript from the live session only) → pause metrics are `{ value: null, confidence: 'na' }`, speech rate uses utterance spans with `confidence: 'low'`.

## 2. Units and normalization

| Lang | Unit for rates | How counted |
|---|---|---|
| `en` | per 100 **words** | `Intl.Segmenter('en', { granularity: 'word' })`, keep `isWordLike`, lowercase. Fillers count as words. |
| `zh` | per 100 **Han characters** | Count of `/\p{Script=Han}/gu` in caller text (punctuation, Latin, digits excluded). |

Baselines are per language, so units never mix.

## 3. Lexicons (`web/lib/markers/lexicon.ts`)

**English fillers** — tokens: `um, uh, er, erm, hmm, mm, ah`; phrases: `you know`, `i mean`. "like" is deliberately excluded (too ambiguous).
**English vague words** — `thing, things, thingy, stuff, something, whatchamacallit, thingamajig, whatsit`.
**Mandarin fillers** — substrings: `嗯, 呃, 额, 唔`. (Sentence-final 啊 and discourse 然后/就是 are excluded as too common.)
**Mandarin vague words** — substrings: `那个, 东西, 什么的, 那什么, 那谁`. Note 那个 is both a hesitation marker and an ordinary demonstrative; this adds noise that the per-person baseline partly absorbs. Document this in the pitch if asked.

Matching rules: English phrase matches run on the lowercase token sequence (a phrase match consumes its tokens, so "you know" counts once, not as two tokens). Mandarin uses non-overlapping left-to-right substring counts on caller text with punctuation removed.

## 4. Marker definitions

Let `U` = number of units (section 2) across all caller utterances.

**`speech_rate`** (unit `wpm` for en, `cpm` for zh; concern: down; group: pace)
- With words: for each caller utterance, `speakingMs = lastWord.endMs − firstWord.startMs`. `value = U / Σ speakingMs × 60000`.
- Without words: use `endMs − startMs` per utterance; confidence `low`.

**Pauses** (requires words; else `na`). A *pause* is a gap `g = next.startMs − prev.endMs` between consecutive caller words where:
- `g ≥ 400 ms` (`PAUSE_MIN_MS`), and `g ≤ 5000 ms` (`PAUSE_MAX_MS`; longer = conversational silence), and
- no agent utterance overlaps `[prev.endMs, next.startMs]` (otherwise it's the agent's turn, not a hesitation).

Consecutive words are taken across the caller's whole word stream sorted by `startMs` (post-call STT may not preserve turn boundaries).

**`pause_rate`** (`per100w` / `per100c`; concern: up; group: pauses) = `pauseCount / U × 100`.
**`mean_pause_ms`** (`ms`; up; pauses) = mean of pause gaps; if there are zero pauses → `value: null`, confidence `low`.
**`wfp_rate`** — word-finding pauses (`per100w` / `per100c`; up; pauses): pauses with `g ≥ 1000 ms` (`WFP_MIN_MS`) where the word immediately before **or** after is a filler or vague word (for zh, the word token *contains* a filler/vague substring). `= wfpCount / U × 100`.
**`filler_rate`** (`per100w` / `per100c`; up; words) = `fillerCount / U × 100`.
**`vague_rate`** (`per100w` / `per100c`; up; words) = `vagueCount / U × 100`.
**`mattr`** (`ratio`; concern: down; group: words) — moving-average type-token ratio, window `W = 50` (`MATTR_WINDOW`). Tokens: en → lowercase word tokens **excluding fillers**; zh → `Intl.Segmenter('zh', { granularity: 'word' })` `isWordLike` tokens excluding fillers. If `n ≥ W`: mean over `i = 0 … n−W` of `unique(tokens[i … i+W−1]) / W`. If `n < W`: plain TTR `unique / n`, confidence `low`. If `n = 0`: `null`, `na`.
**`repeat_stories`** (`count`; up; repetition) — computed in the pipeline (section 6), not in `computeMarkers`.

## 4b. Pitch variation (voice group) — `[HEURISTIC]` extension, chart only

Added Oct 25 (see HANDOFF "Contract changes"). Computed from the caller's call audio (`audioPath`, from agent capture A6), **not** from the transcript. No trained model: classic YIN pitch tracking (de Cheveigné & Kawahara 2002, *JASA* 111(4)), pure TypeScript in `web/lib/markers/pitch.ts`. **Never** described or used as mood, emotion or mental-health information (claims policy).

- **Pitch track:** downsample to 8 kHz; 40 ms frames, 20 ms hop; voicing gate = frame RMS ≥ max(0.1 × the 95th-percentile frame RMS, 1e-3 ≈ −60 dBFS); YIN cumulative-mean-normalised difference, absolute threshold 0.15, parabolic interpolation, search band 60–400 Hz; 5-frame median filter; drop frames more than 10 semitones from the call median (octave errors). Only caller speech is analysed: STT word spans ± 100 ms when present, else the whole file. Cost: ≤ ~3.5 s for 10 minutes of continuous voiced speech (worst case).
- **`pitch_var`** (unit `st`; concern: down; group: voice) — standard deviation of voiced-frame F0 in semitones, `12·log2(f / median f)`.
- **`pitch_range`** (unit `st`; concern: down; group: voice) — 90th minus 10th percentile of voiced-frame F0 in semitones.
- **Confidence:** `high` if ≥ 500 voiced frames (~10 s voiced speech) and the call is adequate by §5; `low` if fewer voiced frames or an inadequate call (value null below 25 frames); `na` when there is no audio.
- Baselines and z follow §7 (absolute spread floor 0.3 st). **Chart only:** the voice group is excluded from drift and nudges (`NUDGE_GROUPS` in `web/lib/analysis/config.ts`) because phone microphones, the FaceTime codec, a cold or room noise all shift pitch. Revisit after real calls.
- Adequacy (§5) is decided by the transcript markers only; voice markers never make a call adequate.

**Test vectors (synthetic):** a steady 150 Hz tone → F0 150 ± 1 Hz, `pitch_var` ≈ 0. A linear 120 → 180 Hz glide → `pitch_range` = 12·log2(174/126) ≈ 5.6 st (p90 − p10 of a linear glide; the full span is 7.0 st). A harmonic-rich 220 Hz tone → no octave halving or doubling. White noise or silence → no voiced frames.

## 5. Confidence

A call is **adequate** if `U ≥ 100` (en) or `U ≥ 150` (zh). For an inadequate call, every computed marker is downgraded to `low`. `low` and `na` points are plotted hollow / omitted and are excluded from baselines and drift. `markerMeta()` provides each marker's label and one-sentence explainer:

| Key | Label | Explainer (family-facing) |
|---|---|---|
| `speech_rate` | Speaking pace | How quickly he talks while speaking, compared with his usual. |
| `pause_rate` | Pauses | How often he pauses mid-thought. |
| `mean_pause_ms` | Pause length | How long those pauses usually last. |
| `wfp_rate` | Searching for words | Longer pauses next to words like "um" or "thing." |
| `filler_rate` | Filler words | Words like "um" and "uh." |
| `vague_rate` | General words | Words like "thing" or "stuff" in place of a specific word. |
| `mattr` | Word variety | How varied his vocabulary is within a stretch of talk. |
| `repeat_stories` | Retold stories | Stories he brought up himself that he also told in another call that week. |
| `pitch_var` | Voice rise and fall | How much his voice rises and falls while he talks, compared with his usual. |
| `pitch_range` | Voice range | The spread between his lower and higher notes when he talks. |

## 6. Repetition (pipeline step)

1. From the LLM extraction, take this call's topics with `kind = 'story'` and `initiatedBy = 'caller'` (a story the agent asked for is never a repeat signal).
2. Embed each summary (`EMBEDDINGS_PROVIDER`); embed any candidate whose `embedding_json` is NULL (seeded topics) lazily and store it. Candidates: caller-initiated stories from **other** calls of the same elder with `started_at` in the 7 days before this call.
3. Match if cosine similarity ≥ `REPEAT_COSINE = 0.85`. Tune against ~10 hand-made pairs in `fixtures/transcripts/repeat-pairs.json` and record the chosen value in HANDOFF.
4. If `EMBEDDINGS_PROVIDER=none`: one LLM call returns, for each new story, the id of a matching prior story or `null`.
5. Set `topics.repeat_of_topic_id`; `repeat_stories` = number of this call's stories with a match. Confidence `high` if the call is adequate.

The agent must never tell the caller he is repeating himself (see `docs/safety-and-copy.md`). Repetition is only visible to the family, only with `speechTrends` consent.

## 7. Baseline

- Per elder, per marker, per language: the **first 6 adequate calls** with a non-null `high`-confidence value (`BASELINE_N = 6`). Stored in `baselines` once 6 exist; frozen afterward (rolling baselines are roadmap).
- `median`, `MAD = median(|x − median|)`.
- `scale = max(1.4826 × MAD, 0.03 × |median|, 1e-6)` (`MIN_SPREAD_FRAC = 0.03`).
- Raw `z = (x − median) / scale`; stored **signed so positive = concerning**: `z_store = concern === 'up' ? z : −z`.
- Baseline calls themselves get z values too (they'll be near 0).
- `repeat_stories` has no baseline; it uses the absolute weekly rule below.

## 8. Drift and nudges

- Weeks are ISO weeks in the elder's timezone.
- For each marker and week: `weekZ = median(z_store)` over adequate calls that week. Weeks with fewer than 2 adequate calls are skipped (no drift, no reset).
- A **group drifts** in a week if any of its markers has `weekZ ≥ 1.5` (`DRIFT_Z`). The **repetition** group drifts if the week's Σ `repeat_stories` ≥ 3 (`REPEAT_WEEKLY_MIN`).
- **`cognitive_checkup` nudge** when ≥ 2 groups (`DRIFT_GROUPS_MIN`) drift in each of 2 consecutive evaluated weeks (`DRIFT_WEEKS`), the elder has ≥ 8 adequate calls (`MIN_CALLS_FOR_NUDGE`), and `effective.speechTrends` is true.
- **`wellbeing` nudge** when `mood_label = 'low'` on ≥ 3 of the last 5 calls and `effective.mood` is true.
- At most one undismissed nudge per type. A dismissed nudge may re-fire 14 days after dismissal if the rule still holds.
- `reason_json.plainLanguage` uses these phrases for drifting markers: pace → "speaking a bit more slowly than usual"; pauses → "pausing more often or for longer"; words → "using more filler or general words, or a narrower range of words"; repetition → "retelling some of the same stories within a week".

## 9. Test vectors (vitest, `web/lib/markers/__tests__/`)

Round to 2 decimals unless noted.

**TV1 — English, no word timestamps**
Caller: `"Um, I went to the store and, uh, bought the thing."`, `startMs 0`, `endMs 4400`.
U = 11 (`um i went to the store and uh bought the thing`).
`filler_rate` = 18.18 · `vague_rate` = 9.09 · `speech_rate` = 150.00 wpm (`low`) · `mattr` = 0.89 (8 unique / 9 non-filler tokens; `low`) · `pause_rate`, `mean_pause_ms`, `wfp_rate` = `null`/`na`. All confidences `low` or `na` (U < 100).

**TV2 — English with words**
Words: `hello 0–400`, `there 450–800`, `i 1500–1600`, `um 1700–1900`, `forgot 3000–3400`. No agent utterances.
Pauses: 700 ms (there→i), 1100 ms (um→forgot). `pause_rate` = 40.00 · `mean_pause_ms` = 900.00 · `wfp_rate` = 20.00 (the 1100 ms pause follows "um") · `speech_rate` = 88.24 wpm · `filler_rate` = 20.00.

**TV2b — agent overlap exclusion**
TV2 plus an agent utterance `2000–2800`. The 1100 ms gap is excluded. `pause_rate` = 20.00 · `mean_pause_ms` = 700.00 · `wfp_rate` = 0.00.

**TV3 — Mandarin, text only**
Caller: `"我那个，嗯，想不起来那个东西了"`. Han chars U = 13.
`filler_rate` = 7.69 (嗯) · `vague_rate` = 23.08 (那个 ×2, 东西 ×1).

**TV4 — MATTR window**
60 tokens alternating `the cat the cat …` → `mattr` = 0.04.

**TV5 — baseline and signed z**
Baseline `speech_rate` values `[130, 135, 140, 128, 138, 133]` → median 134, MAD 4, scale 5.9304. New value 120 → raw z −2.36 → stored z **+2.36** (concern is down).

**TV6 — drift rule**
Weeks W1–W4, each with 3 adequate calls. W3 weekZ: speech_rate 2.1, pause_rate 1.8, filler_rate 0.4. W4 weekZ: speech_rate 2.4, vague_rate 1.7. W3 drifting groups = {pace, pauses}; W4 = {pace, words}. Two consecutive weeks with ≥ 2 groups and ≥ 8 adequate calls → nudge fires. Same data with `effective.speechTrends = false` → no nudge.

**TV7 — repetition rule**
Week with repeat counts per call `[1, 1, 1]` → group drifts. `[1, 0, 1]` → does not.
