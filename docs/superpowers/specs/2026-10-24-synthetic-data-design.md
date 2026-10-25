# Task 2: reproducible synthetic calls for Remi

Status: approved by the user in conversation. Implementation with subagents is authorized. Commits, pushes, and live provider calls require separate authorization.

## Intent and agreed scope

Produce clearly fictional conversations for a four-week demonstration and later human-reviewed repeat-detector evaluation. Repetition and longer pauses are authored properties of this dataset; neither establishes dementia or any medical condition.

User decisions: three calls per week, twelve total, approximately 3–5 minutes each; roughly 50% new story/question occurrences, 30% unprompted repeats, 15% prompted retellings, 5% uncertain cases; same-topic negatives among new material; template-driven generation with seeded variation; transcripts and synthetic timing only. No TTS, audio files, STT, threshold calibration, or accuracy report in this iteration.

## Repository audit and boundaries

Base: origin/main at 70b39ce13e2468cb3d2cd1c96066ee76fc878ad7. Task 1's detector at 8e6d13c is merged unchanged. Task 2 branch: ws/ryan-synthetic-data in /Users/ryanwatach/.codex/worktrees/7794/remi. Original main checkout and other worktrees stay untouched.

The actual detector accepts {elderId,callId,startedAt,isSimulated,utterances}; speakers are caller/agent, offsets are nonnegative integer milliseconds. Extraction grounds literal quotes against sourceTurnIndex, and embedding sees extracted summaries only. analyzeCall accepts {call,history,processingAllowed}. History must come from actual earlier detector results, not authored truth. It compares all earlier same-elder calls, with provisional threshold 0.85 and no second AI verification.

Siyuan's merged backend has Utterance[] with optional caller words: {w,startMs,endMs}. computeMarkers requires words for pause metrics; recognized gaps are 400–5000 ms and exclude overlapping agent speech. Its separate repeat matcher still uses a seven-day window and different threshold. That implementation is not replaced or used to assess Task 1. The existing call-creation API does not accept isSimulated, so generated calls must not be automatically posted to it. Database ingestion and detector persistence remain teammate integration work. The existing demo seed resets data and is not invoked or modified.

## Approaches

Chosen by the user: authored incident templates with seeded selection of paraphrases, dialogue wrappers, scheduling, and timing. Advantages: offline, auditable, byte-reproducible. Limitation: finite linguistic diversity and template-specific evaluation bias.

Alternative discussed: templates plus optional OpenAI rewriting. More phrasing variety, but paid nondeterministic generation and potential incident/label drift; would need cached outputs and review. Deferred by the user's choice.

## Proposed builder decisions

Use a dependency-free Node 24 ES-module package under synthetic/, matching detector/. Reuse the existing fictional persona Harold “Hal” Bennett, 81, retired Altoona railroad mechanic, living in Hollidaysburg, with daughter Linda and grandson Sam. Keep a separate synthetic elder ID; do not collide with elder-hal-demo. Preserve established biographical facts. Incidents can involve railway work, gardening, cooking, family visits, music, and trips. Questions concern ordinary plans or practical information. Avoid medical plots, memory quizzes, and statements that the caller is deteriorating.

Default start date: Monday 2026-09-28; timezone America/New_York; Mon/Wed/Fri at 10:00 local for four ISO weeks, with the last scheduled call on 2026-10-23. The date is explicit and never derived from the current clock. Resolve local dates to zoned UTC timestamps, including DST boundaries for custom dates; reject nonexistent/ambiguous local times rather than silently shift them.

Inputs: versioned JSON config with seed (uint32, default 42), startDate (Monday YYYY-MM-DD), callsPerWeek (2–4, default 3). Four weeks and five planned story/question occurrences per call are fixed for v1. Presets: 2=Mon/Thu, 3=Mon/Wed/Fri, 4=Mon/Tue/Thu/Fri. Timezone, local hour, ratios, duration target, and pause schedule are recorded in resolved config; v1 does not expose arbitrary unsupported knobs. Reject unknown config keys, invalid dates/seeds/counts, impossible schedules, and insufficient catalog capacity before output publication.

## Content and labels

Default: 60 planned occurrences across 12 calls: 30 first occurrences, 18 unprompted repeats, 9 prompted retellings, 3 repeats with uncertain elicitation. Uncertain means ambiguous prompting, not an unknown underlying incident. These are planted author judgments pending human review. New items also carry their own elicitation annotation, but are not counted as repeats.

The authored catalog supplies at least 40 distinct incidents/questions to support the maximum configuration, each with multiple meaning-preserving phrasings. An incident's who/what/where/when anchors remain stable across its paraphrases. Same-topic negatives differ in substantive incident details, not just an ID. Default contains at least six explicit negative pairs; both members appear, have different incident identities, and are linked in sidecar truth. At least one repeat reaches back more than seven days. Each repeat category and the negatives cover stories and questions over the corpus. No same-incident duplicate within a single call. Conversational openings/closings and responses should not accidentally introduce additional salient incidents or standalone questions; human review will still assess extraction coverage.

Each call has five distinct incident/question slots, warm back-and-forth dialogue, and at least 100 caller words. Full-dialogue word counts and synthetic speaking durations must yield 180–300 seconds. Use sufficiently developed story templates, not appended silence or meaningless filler to meet duration. Validation rejects an invalid duration.

Distribution for other supported counts uses documented largest-remainder rounding, followed by deterministic feasibility allocation that prioritizes introductions before repeats. The manifest records actual counts. The seed changes choices and ordering while preserving constraints. Use a fixed named PRNG algorithm and separately derived streams for content, planning, and timing; never Math.random, wall-clock timestamps, random UUIDs, locale-dependent sorting, or absolute output paths in deterministic files.

## Tuning and held-out separation

Assign incident families to tuning or held-out before scheduling. A family includes every paraphrase/retelling and its closely related hard-negative sibling incidents. Never split a family across sets. Shared persona and broad themes remain possible; document that this small single-persona corpus is not representative real-world validation.

Calls are partition-pure. Default has six tuning and six held-out calls, interleaved over all four weeks (tuning weekly counts 2/1/2/1; held-out 1/2/1/2). Each split introduces its own incidents before repeating them and contains stories, questions, prompted/unprompted/uncertain cases, and hard negatives. For 2 or 4 calls/week, use equal weekly partition counts. Preserve exact global target counts, with deterministic per-split allocation. A held-out repeat may reference earlier held-out calls; its first occurrence is context, not leaked tuning material.

Future evaluation replays each partition chronologically with its own empty initial history. A full-demo replay may use all calls chronologically, but must be marked demonstration, not held-out evaluation. Merely holding out dates does not constitute incident separation. Task 3 reviews truth, tunes only on tuning data, freezes settings, then reports held-out results. Task 2 never changes thresholds or claims semantic accuracy.

## Outputs and separation

CLI proposal: node synthetic/cli.mjs --config synthetic/config/default.json --output /absolute/new-directory. Output directory must not already exist. No database, HTTP, provider calls, or environment-file loading during generation.

Bundle:

- manifest.json: schema/generator/catalog versions, resolved config, seed, isSimulated:true, synthetic notice, timing provenance, file SHA-256 digests, ordered call IDs, and planned counts. No generation-time clock value.
- profile.json: the single fictional persona, synthetic ID, isSimulated:true, and fiction notice. Biography contains no planted incident keys or expected matches.
- calls/<opaque-call-id>.json: canonical synthetic call envelope with ID, elder ID, startedAt/endedAt, language, isSimulated:true, synthetic notice, timingSource:'synthetic_authored', audioPath:null, and utterances including caller words. No incident IDs, expected labels/matches, split names, or pause annotations embedded in dialogue.
- detector-inputs/<opaque-call-id>.json: exact public detector Call shape with isSimulated:true, caller/agent text and turn offsets only. These are call values, not standalone CLI {call,history,processingAllowed} envelopes; document the distinction. Model input never receives generated profile, manifest, truth, or timing annotations.
- ground-truth/<opaque-call-id>.json: planted incident/family IDs, kind, first-occurrence/repeat status, elicitation and display labels (Unprompted repeat, Prompted retelling, Uncertain), all eligible earlier same-incident occurrence references, explicit distinct-incident negative links, and prompt evidence where relevant. Each occurrence has sourceTurnIndex plus exact quote and zero-based UTF-16 [start,end) offsets into that unchanged caller turn. References use call ID plus occurrence ID, never fabricated detector item IDs.
- ground-truth/splits.json: incident-family and call membership for tuning/held-out.
- timing/<opaque-call-id>.json: planned pause spans, word boundaries, planted versus ordinary gaps, weekly schedule, isSimulated:true, and explicit “authored timing; no audio measured.”
- README.txt: synthetic/nonmedical notice, commands, format descriptions, split usage, and backend handoff cautions.

Every JSON artifact includes isSimulated:true where the public contract permits it; the detector call contract already does. Plain text artifacts identify themselves as synthetic. Call IDs are opaque and deterministic, with no incident/class/split encoded. Output filenames are generated internally, not taken from catalog paths. Golden data and detector-facing data are different files built through an explicit allowlist; do not depend on the detector silently discarding extra fields.

## Synthetic timing

Use whitespace-delimited word tokens preserving punctuation; store exact token text and nonnegative integer start/end offsets. Caller words remain inside caller turns, globally chronological and nonoverlapping; agent turns never overlap planted caller pauses. Retain the same turn order/text in canonical calls and detector exports so quote alignment is stable.

Proposed planted internal pauses: weekly centers 600/850/1100/1400 ms with seeded bounded jitter ±75 ms. Keep a fixed planted-pause count per call so the main authored change is pause duration, not frequency. Ordinary within-turn gaps stay below 400 ms. Inter-speaker gaps are separate and never presented as hesitation. Use strictly nonoverlapping weekly ranges; overall speech duration comes from declared synthetic word-duration rules plus gaps. Timing sidecars record exact placement and totals, and endedAt matches the final utterance end. These schedules are engineering fixtures, not clinical thresholds.

Canonical words can exercise computeMarkers directly, but the backend treats words as STT provenance and can report high algorithmic confidence. Consumers must preserve the simulation badge and timing-source notice; no “measured speech” claim is allowed. Provide an in-memory handoff example and document schema/provenance limitations, without editing the backend or importing records. There is no audio path or audio claim.

## Reproducibility and safe publication

Generate and validate the complete bundle before writing. Use stable property order, UTF-8, LF, final newline, and relative slash-separated manifest paths. Hash all payload files; manifest omits its own digest. The catalog/config/generator versions make reproducibility scope explicit. Same seed/config/version produces identical bytes regardless of output directory.

Reserve the output directory exclusively; refuse existing directories, files, and symlinks without modifying them. Write only internally determined filenames with exclusive creation. Write manifest last as the completion marker. On I/O failure, report the incomplete new directory; do not delete unrelated data or silently overwrite a partial prior run. No --force option. Large/unbounded configs are rejected. Generation reads only its bundled catalog and explicit config.

## File ownership and proposed implementation sequence

Only new synthetic/** and Task 2-specific docs/superpowers/{specs,plans}/ files are owned. Preserve detector/**, web/**, fixtures/**, agent/voice files, root manifests/locks, original specs, and existing uncommitted changes. No dependency installation is expected. No subagent commits or pushes.

After design approval, write the detailed implementation plan and agree schemas first:

1. Implementer A: synthetic/src/contracts.mjs and matching contract tests; finalize versioned config/artifact/annotation schemas, source offsets, split invariants, and safe export contract.
2. Implementer B: synthetic/catalog/**, synthetic/src/content.mjs, content tests; author Hal-compatible incidents, distinct same-topic pairs, paraphrases, wrappers and label evidence.
3. Implementer C: synthetic/src/timing.mjs and timing tests; deterministic word timing and pause provenance. B and C may run in parallel only after A's shared contracts are settled, with separate file ownership.
4. Implementer D: synthetic/src/plan.mjs, synthetic/src/generate.mjs, planning/generation tests; assemble chronology, split allocation, seed streams, IDs, and validated artifacts using B/C. This step depends on B/C.
5. Implementer E: synthetic/cli.mjs, synthetic/src/write.mjs, synthetic/package.json, synthetic/config/**, CLI tests, README and examples; safe output publication, documented generation and read-only replay usage.
6. Integration/test owner: synthetic/tests/integration.test.mjs and detector-boundary tests; full acceptance checks, real detector parseCall compatibility, and actual analyzeCall orchestration with controlled HTTP transport only for software testing. Independent reviewers inspect each step and the final whole change.

Every implementer is told others are working in the repository and must preserve their edits. Tests establish meaningful failing-then-passing evidence before implementation. Failed reviews return to the same owner. No live model run without separate user authorization and local credentials. Generated demo data never includes embedding vectors. Existing detector test doubles remain software tests only; do not create fake vectors to make demonstration results look successful.

## Acceptance and evidence

1. Same seed/config/version in two new directories yields identical file bytes and hashes; different seeds change variation while maintaining invariants.
2. Exactly four weeks and 4*callsPerWeek calls, valid calendar dates/zones, stable chronology, 180–300 seconds and >=100 caller words per call; validate 2/3/4 call presets and DST boundaries.
3. Every profile/call/sidecar is explicitly synthetic. No audio files; audioPath is null and timing is declared authored.
4. Default totals are 30 new, 18 unprompted repeats, 9 prompted retellings, 3 uncertain repeats. Sidecar references point only to strictly earlier same-incident calls; negative pairs have different substantive incidents; each split has required categories and no shared family.
5. All source quotes/UTF-16 spans and prompt evidence align with emitted turns. No source-text mutation between canonical and detector files.
6. Nonnegative ordered word/turn intervals, correct pause ranges/counts and endedAt; no agent overlap or invented measured-audio provenance.
7. Detector exports satisfy real parseCall. Boundary tests place sentinel golden fields in richer source objects and assert they cannot enter export or Responses input; embeddings see only extracted summaries. Labels, incident IDs, splits and expected decisions never populate detector history.
8. Chronological offline integration drives the actual analyzeCall pipeline with controlled OpenAI-shaped responses and previous returned items as history. This verifies wiring, not semantic detection. No generated demonstration embeddings or accuracy results.
9. Existing detector test and syntax commands still pass. Validate new CLI/scripts using node:test and node --check. No backend source changes or unsafe database/reset smoke tests.
10. Existing outputs, symlinks and unrelated files survive failed/duplicate generation untouched; invalid inputs fail before publication; no network, secrets, or unexpected writes.

Delivery includes exact commands, artifacts, changed files, test results, integration gaps, and a clear separation of offline software tests from unperformed live OpenAI/audio checks. Task 3 semantic evaluation and human label review remain pending. Obtain explicit approval before any Task 2 commit or push; main is never merged or modified by this task.
