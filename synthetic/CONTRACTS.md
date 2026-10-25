# Synthetic data shared contracts (schema 1)

These interfaces are the integration contract for the offline synthetic generator. Modules are native Node ESM; no dependencies, external services, model sessions, authored detector history, or generated embedding vectors. Files and outputs are deterministic for the same config and generator/catalog versions. Every profile, call, truth, timing and split artifact explicitly identifies itself as simulated. Planted labels are `planted_unreviewed` author judgments, not detector results or clinical evidence.

## Configuration and random streams

`src/contracts.mjs` exports `resolveConfig(raw={})`, `toDetectorCall(canonical)`, and `serialize(value)`.

Raw configuration permits only own keys `schemaVersion` (exactly 1), `seed` (integer 0 through 4294967295), `startDate` (a real Monday in exact YYYY-MM-DD format, years 2000–2099), and `callsPerWeek` (2, 3, or 4). Present undefined values are invalid. Unknown keys, including symbol keys, fail. Defaults are schema 1, seed 42, date 2026-09-28, and three calls/week. Validation throws before output creation.

The resolved object is exactly:

```js
{
  schemaVersion: 1, seed: 42, startDate: '2026-09-28', callsPerWeek: 3,
  weeks: 4, timezone: 'America/New_York', localHour: 10,
  weekdays: [0, 2, 4], slotsPerCall: 5,
  pauseCentersMs: [600, 850, 1100, 1400], pauseJitterMs: 75,
  pausesPerCall: 8, minDurationMs: 180000, maxDurationMs: 300000
}
```

Monday is weekday 0. Presets: 2 -> [0,3], 3 -> [0,2,4], 4 -> [0,1,3,4]. Returned arrays are fresh. A resolved config is not raw config: do not pass fixed rule fields back into `resolveConfig`. Schedules construct each date at New York 10:00 local time; elapsed milliseconds and UTC instants must handle DST and year rollover correctly.

`src/random.mjs` exports:

- `makeRng(seed,label)`: SHA-256 of UTF-8 `JSON.stringify([seed,label])`; read the first four digest bytes as uint32 **little endian**. This initializes mulberry32. Each draw adds `0x6D2B79F5` modulo 2^32; let `t=state`, then `t=Math.imul(t ^ (t >>> 15), t | 1)`, `t ^= t + Math.imul(t ^ (t >>> 7), t | 61)`, return `((t ^ (t >>> 14)) >>> 0) / 4294967296`. Named streams do not share mutable state. For (42,'schedule') the first four draws are 0.7987425299361348, 0.17692595347762108, 0.1270128923933953, 0.9869534957688302.
- `shuffle(items,rng)`: copied descending Fisher-Yates; for i from n-1 down to 1 swap with `floor(rng()*(i+1))`. Source is unchanged.
- `stableId(namespace,...parts)`: namespace + '_' + first 24 lowercase SHA-256 hex characters of UTF-8 `JSON.stringify(parts)`. Use stable opaque parts for call IDs, independent of labels.

All sorting uses explicit lexical comparisons (`a < b ? -1 : a > b ? 1 : 0`), never locale-dependent comparisons. Never use wall-clock timestamps, Math.random, random UUIDs, or absolute output paths in deterministic artifacts. `serialize(value)` is `JSON.stringify(value,null,2)` plus one LF, for JSON-serializable artifact values; property insertion order is preserved.

## Detector boundary and canonical calls

`toDetectorCall(canonical)` requires `canonical.isSimulated === true`, constructs an allowlisted copy and validates with the actual `parseCall` from `detector/src/contracts.mjs`. It returns only:

```js
{ elderId, callId, startedAt, isSimulated: true,
  utterances: [{ speaker, text, startMs, endMs }] }
```

Speakers are `caller` or `agent`; text is unchanged. `startedAt` is normalized by parseCall to a UTC ISO timestamp. Turn timing is required for these synthetic exports. All words, pauses, labels, incident/family/occurrence IDs, expected matches, splits and arbitrary extras are stripped. The result has independent arrays and objects; mutations cannot reach its source. Never forward a rich source envelope directly to a detector request.

Canonical calls contain elderId, callId, startedAt, endedAt, language, isSimulated:true, a fiction notice, timingSource:'synthetic_authored', audioPath:null, and utterances. Caller turns have words; agent turns need only start/end. No split, incident ID, expected label/match, or pause annotations occur in canonical calls or exports. The profile is one fictional persona with its synthetic identity in elderId and a fiction notice; its biography contains no planted keys or expected matches.

## Catalog and rendering

`CATALOG_VERSION='1.0.0'`. The catalog array has 40 entries: 24 stories and 16 questions, arranged in 20 two-entry families. Each entry has `{id,familyId,kind,topic,anchors:string[],variants:string[>=3],specificPrompt,ambiguousPrompt,response}`. `kind` is story/question. Variants preserve the same substantive incident or question. The two incidents within a family are substantive negatives despite related topics; IDs never occur in prose. The persona is synthetic.

`renderOccurrence(entry,{variantIndex,elicitation})` returns `{utterances:[{speaker,text}],sourceTurnIndex,quote,start,end,promptTurnIndex}`. Elicitation is unprompted/prompted/uncertain. Quote is an exact substring of one caller source turn, with zero-based UTF-16 `[start,end)` offsets (`text.slice(start,end) === quote`). Prompted renderings have explicit preceding agent evidence and its relative turn index. Uncertain renderings have an ambiguous cue but `promptTurnIndex:null`. Unprompted renderings have no incident-specific invitation and null prompt index. New material may use unprompted dialogue. Turn indices are relative to the returned segment; the generator rebases them into the call. Preserve text after calculating evidence spans.

## Authored timing

`timeDialogue(utterances,{seed,callId,weekIndex,config})` returns:

```js
{ utterances, durationMs, timing: {
  isSimulated:true, timingSource:'synthetic_authored', notice, weekIndex,
  pauseCenterMs, pauses:[{turnIndex,afterWordIndex,startMs,endMs,durationMs,kind:'planted'}],
  ordinaryGapMs, turnGapMs, wordDurationRule
} }
```

Week index is zero-based. Each call lasts 180000–300000 ms and contains at least 100 caller words. Every call has exactly eight planted internal caller pauses: weekly centers [600,850,1100,1400], each jittered ±75 ms. Ordinary gaps are below 400 ms. Caller words are `{w,startMs,endMs}`; interval values are nonnegative ordered integer milliseconds with no speaker overlap. Pause placement references caller word indices, within a turn; no pause is represented as measured audio. Fixed word-duration rules target about 120–140 words/minute; do not stretch words or append silence to force duration. Preserve utterance text/order. `endedAt` agrees with startedAt + durationMs.

## Planning and generation

`planCalls(config,catalog)` returns `{calls,counts,splits}`. Each planned call is `{callId,weekIndex,startedAt,split,occurrences:[{occurrenceId,incidentId,familyId,kind,category,elicitation,variantIndex}]}`. Category is new/unprompted/prompted/uncertain; isRepeat means category != 'new'. Each call has exactly five distinct incidents, three stories and two questions. Introductions precede repeats, and all repeat references target strictly earlier calls.

Default counts are `{new:30,unprompted:18,prompted:9,uncertain:3}` across twelve calls. Alternate presets preserve exact largest-remainder totals and feasibility. Family assignment precedes scheduling and keeps families (including negative siblings) wholly within one split. Both splits contain both kinds, all elicitation classes and hard negatives. Default includes six negative pairs and a repeat older than seven elapsed days. Default split call counts are six each, weekly tuning counts 2/1/2/1 and held-out counts 1/2/1/2; 2/4-call presets have equal weekly split counts.

`splits={isSimulated:true,tuning:{callIds,familyIds},heldOut:{callIds,familyIds}}`. Call IDs are opaque and independent of planted labels.

`generateBundle(rawConfig={})` returns `{config,profile,calls,detectorCalls,groundTruth,timings,splits,manifest}`. Calls, detector calls, truth and timing arrays are chronological, aligned by callId. Timings have callId added. Manifest includes schema/generator/catalog versions, resolved config, seed, isSimulated:true, fiction notice, timing provenance, counts and ordered callIds. It has no generation-time clock. File hashes are added only by the writer.

Each ground-truth entry is:

```js
{ isSimulated:true, callId, reviewStatus:'planted_unreviewed',
  occurrences:[{occurrenceId,incidentId,familyId,kind,isRepeat,elicitation,label,
    sourceTurnIndex,quote,start,end,promptTurnIndex,
    priorOccurrences:[{callId,occurrenceId}]}],
  negativePairs:[{incidentIds:[a,b]}]
}
```

Labels are exactly 'New material', 'Unprompted repeat', 'Prompted retelling', or 'Uncertain'. New occurrences have empty priorOccurrences; repeats list all eligible earlier same-incident occurrences, using synthetic occurrence IDs, never fabricated detector item IDs. Negative pairs identify distinct sibling incidents from catalog metadata.

## Independent validation and exclusive publication

`validateBundle(bundle)` returns the bundle or throws. Independently validate chronology and timezone, counts, caller words, durations, labels, exact spans and prompt evidence, word/turn/pause interval rules, prior references/identity, negative semantics against catalog families, family split separation and exported allowlist. Do not trust producer-supplied summaries as proof of validity.

`bundleFiles(bundle)` returns `Map<relativePath,string>` with serialized payloads. Layout: `profile.json`, `calls/<callId>.json`, `detector-inputs/<callId>.json`, `ground-truth/<callId>.json`, `timing/<callId>.json`, `ground-truth/splits.json`, `README.txt`, and `manifest.json`. Manifest.files is an object mapping every payload file’s relative slash-separated path to its lowercase SHA-256 hex digest; it omits its own digest and is emitted last.

`writeBundle(bundle,outputDir)` returns `{outputDir,fileCount}`. Validate before mkdir. Reserve a new output directory exclusively, reject any existing file/directory/symlink, unsafe components, traversal or generated paths escaping the destination. Use exclusive file creation and resist racing creation. Preserve all existing data. On I/O failure report the incomplete new directory without deleting unrelated content. No force/overwrite option. Same config/versions produces byte-identical content regardless of output directory.
