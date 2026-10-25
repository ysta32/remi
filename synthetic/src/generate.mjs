import { catalog, CATALOG_VERSION } from '../catalog/incidents.mjs';
import { persona } from '../catalog/persona.mjs';
import { resolveConfig, toDetectorCall } from './contracts.mjs';
import { renderOccurrence } from './content.mjs';
import { planCalls } from './plan.mjs';
import { timeDialogue } from './timing.mjs';
import { validateBundle } from './validate.mjs';
import { OPENING_TEXT, CLOSING_TEXT } from './framing.mjs';

export const GENERATOR_VERSION = '1.0.0';
const NOTICE = 'SIMULATED FICTION: authored fictional calls and planted_unreviewed labels, not real people, recordings, detector results, or clinical evidence.';
const labels = { new: 'New material', unprompted: 'Unprompted repeat', prompted: 'Prompted retelling', uncertain: 'Uncertain' };
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** Assemble the reviewed authored catalog; truth stays separate from detector inputs. */
export function generateBundle(rawConfig = {}) {
  const config = resolveConfig(rawConfig);
  const plan = planCalls(config, catalog);
  const entries = new Map(catalog.map(entry => [entry.id, entry]));
  const families = new Map();
  for (const entry of catalog) {
    if (!families.has(entry.familyId)) families.set(entry.familyId, []);
    families.get(entry.familyId).push(entry.id);
  }
  const calls = [], detectorCalls = [], groundTruth = [], timings = [];
  const prior = new Map();
  for (const planned of plan.calls) {
    const dialogue = [{ speaker: 'agent', text: OPENING_TEXT }];
    const occurrences = [];
    for (const occurrence of planned.occurrences) {
      const rendered = renderOccurrence(entries.get(occurrence.incidentId), occurrence);
      const offset = dialogue.length;
      dialogue.push(...rendered.utterances);
      occurrences.push({
        occurrenceId: occurrence.occurrenceId, incidentId: occurrence.incidentId,
        familyId: occurrence.familyId, kind: occurrence.kind,
        isRepeat: occurrence.category !== 'new', elicitation: occurrence.elicitation,
        label: labels[occurrence.category], sourceTurnIndex: offset + rendered.sourceTurnIndex,
        quote: rendered.quote, start: rendered.start, end: rendered.end,
        promptTurnIndex: rendered.promptTurnIndex === null ? null : offset + rendered.promptTurnIndex,
        priorOccurrences: (prior.get(occurrence.incidentId) ?? []).map(row => ({ ...row })),
      });
    }
    dialogue.push({ speaker: 'agent', text: CLOSING_TEXT });
    const timed = timeDialogue(dialogue, { seed: config.seed, callId: planned.callId, weekIndex: planned.weekIndex, config });
    if (timed.durationMs < config.minDurationMs || timed.durationMs > config.maxDurationMs) throw new RangeError('Authored call duration is outside the supported range.');
    const call = {
      elderId: persona.elderId, callId: planned.callId, startedAt: planned.startedAt,
      endedAt: new Date(Date.parse(planned.startedAt) + timed.durationMs).toISOString(),
      language: persona.language, isSimulated: true, notice: NOTICE,
      timingSource: 'synthetic_authored', audioPath: null, utterances: timed.utterances,
    };
    // Update only after rendering the whole call: all references are earlier calls.
    for (const occurrence of occurrences) {
      const rows = prior.get(occurrence.incidentId) ?? [];
      prior.set(occurrence.incidentId, [...rows, { callId: call.callId, occurrenceId: occurrence.occurrenceId }]);
    }
    const negativePairs = [...new Set(occurrences.map(o => o.familyId))].sort(lexical)
      .map(family => families.get(family).slice().sort(lexical))
      .filter(ids => ids.every(id => prior.has(id)))
      .map(incidentIds => ({ incidentIds }));
    calls.push(call);
    detectorCalls.push(toDetectorCall(call));
    groundTruth.push({ isSimulated: true, callId: call.callId, reviewStatus: 'planted_unreviewed', occurrences, negativePairs });
    timings.push({ callId: call.callId, ...timed.timing });
  }
  const bundle = {
    config, profile: structuredClone(persona), calls, detectorCalls, groundTruth, timings,
    splits: plan.splits,
    manifest: {
      schemaVersion: 1, generatorVersion: GENERATOR_VERSION, catalogVersion: CATALOG_VERSION,
      isSimulated: true, notice: NOTICE, timingSource: 'synthetic_authored',
      config: structuredClone(config), seed: config.seed, counts: { ...plan.counts },
      callIds: calls.map(call => call.callId),
    },
  };
  return validateBundle(bundle);
}
