import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RepeatDetections } from '../RepeatDetections';
import { HowHesDoing } from '../HowHesDoing';
import { SnapshotCard } from '../SnapshotCard';
import { ChatCard } from '../ChatCard';
import { earlierCallsForTarget } from '../TimelineView';
import { syntheticTranscriptNotice, SYNTHETIC_TRANSCRIPT_NOTICE } from '@/lib/synthetic-demo';
import type { RepeatAnalysisView, Timeline } from '@/lib/types';
vi.stubGlobal('React', React);
const analysis: RepeatAnalysisView = {
  scope: 'all_prior_calls', status: 'complete', analyzedCallCount: 12, totalCallCount: 12,
  counts: { total: 3, unprompted: 1, prompted: 1, uncertain: 1, stories: 2, questions: 1 },
  provenance: { extractionModel: 'extract-model', embeddingModel: 'embed-model', threshold: 0.85, detectorVersion: 'v1' },
  matches: ['Unprompted repeat', 'Prompted retelling', 'Uncertain'].map((label, i) => ({
    callId: 'new', startedAt: '2026-10-20T14:00:00Z', priorCallId: 'old /?', priorStartedAt: '2026-09-28T14:00:00Z',
    kind: i === 2 ? 'question' : 'story', label: label as RepeatAnalysisView['matches'][number]['label'],
    similarity: 0.9234, summary: 'A shared memory', quote: 'Current actual quote', priorQuote: 'Prior actual quote', isSimulated: true,
  })),
};
const timeline = {
  elder: { id: 'elder /', preferredName: 'Hal' }, consent: { elderConfirmed: true },
  markers: [], repeats: [], repeatAnalysis: analysis,
} as unknown as Timeline;
const render = (value = analysis) => renderToStaticMarkup(React.createElement(RepeatDetections, { analysis: value, elderId: 'elder /' }));
describe('repeat detections visible evidence', () => {
  it('renders counts, all-history scope, provisional provenance and expandable actual evidence', () => {
    const html = render();
    for (const text of ['Repeated stories and questions', '3 repeats detected', 'Unprompted repeat: 1', 'Prompted retelling: 1', 'Uncertain: 1', 'Stories: 2', 'Questions: 1', 'Compared with all earlier calls', '12 of 12 calls analyzed', 'Provisional threshold: 0.85', 'extract-model', 'embed-model', 'v1', 'not a probability', 'Similarity: 0.923', 'Current actual quote', 'Prior actual quote', 'Simulated']) expect(html).toContain(text);
    expect(html).toContain('<details');
    expect(html).toContain('/elders/elder%20%2F?call=old%20%2F%3F#call-old%20%2F%3F');
  });
  it('distinguishes complete zero from missing analysis and partial coverage', () => {
    const zero = { ...analysis, counts: { total: 0, unprompted: 0, prompted: 0, uncertain: 0, stories: 0, questions: 0 }, matches: [] };
    expect(render(zero)).toContain('No repeats detected at this threshold');
    const partial = render({ ...zero, status: 'partial', analyzedCallCount: 4 });
    expect(partial).toContain('Some calls have not been analyzed');
    expect(partial).toContain('4 of 12 calls analyzed');
    expect(partial).toContain('Counts cover analyzed calls only');
  });
  it('shows redacted evidence honestly without fabricating quotes or summaries', () => {
    const html = render({ ...analysis, matches: analysis.matches.map(m => ({ ...m, summary: null, quote: null, priorQuote: null })) });
    expect(html).toContain('Evidence hidden by sharing choices');
    expect(html).not.toContain('Current actual quote');
    expect(html).not.toContain('A shared memory');
  });
  it('shows analysis on doing even without markers, but preserves legacy fallback', () => {
    expect(renderToStaticMarkup(React.createElement(HowHesDoing, { timeline }))).toContain('Repeated stories and questions');
    expect(renderToStaticMarkup(React.createElement(HowHesDoing, { timeline: { ...timeline, repeatAnalysis: undefined } }))).toContain('after a few more chats');
  });
  it('hides legacy retold signals only while standalone analysis exists', () => {
    const withMarkers = { ...timeline, markers: [{ key: 'repeat_stories', points: [], baseline: null }] } as unknown as Timeline;
    expect(renderToStaticMarkup(React.createElement(HowHesDoing, { timeline: withMarkers }))).not.toContain('Retold stories');
    expect(renderToStaticMarkup(React.createElement(HowHesDoing, { timeline: { ...withMarkers, repeatAnalysis: undefined } }))).toContain('Retold stories');
  });
  it('expands calls beyond the initial four for the target link and gives cards stable anchors', () => {
    const calls = Array.from({ length: 8 }, (_, i) => ({ id: `call-${i}` }));
    expect(earlierCallsForTarget(calls, false, 'call-7')).toHaveLength(8);
    expect(earlierCallsForTarget(calls, false, 'unknown')).toHaveLength(4);
    expect(earlierCallsForTarget(calls, true, undefined)).toHaveLength(8);
    const call = { id: 'old /?', startedAt: '2026-09-28T14:00:00Z', durationS: 180, status: 'done', summary: null, mood: null, photosShown: [], familyQuestion: null, isSimulated: true } as const;
    const html = renderToStaticMarkup(React.createElement(SnapshotCard, { call: { ...call, photosShown: [] }, variant: 'compact', isNew: false, confirmed: true, photos: [], name: 'Hal' }));
    expect(html).toContain('id="call-old /?"');
  });
  it('keeps stored provenance unchanged while displaying actual analysis availability', () => {
    expect(syntheticTranscriptNotice(false)).toBe(SYNTHETIC_TRANSCRIPT_NOTICE);
    const notice = syntheticTranscriptNotice(true);
    expect(notice).toContain('Call timing is authored');
    expect(notice).toContain('summaries have not been run');
    expect(notice).not.toContain('repeat analysis have not been run');
  });
});

it('preserves six-card pagination and expands older repeat targets in the recap layout', () => {
  const calls = Array.from({ length: 14 }, (_, i) => ({ id: `call-${i}` }));
  expect(earlierCallsForTarget(calls, false, undefined, 6)).toHaveLength(6);
  expect(earlierCallsForTarget(calls, false, undefined, 12)).toHaveLength(12);
  expect(earlierCallsForTarget(calls, false, 'call-13', 6)).toHaveLength(14);
  expect(earlierCallsForTarget(calls, false, ['call-13'], 6)).toHaveLength(6);
});
it('gives recap cards the same stable targets used by repeat evidence links', () => {
  const call = { id: 'old /?', startedAt: '2026-09-28T14:00:00Z', durationS: 180, status: 'done', summary: null, mood: null, photosShown: [], familyQuestion: null, isSimulated: true } as const;
  const html = renderToStaticMarkup(React.createElement(ChatCard, { call: { ...call, photosShown: [] }, href: '/recap', highlight: false, factCount: 0 }));
  expect(html).toContain('id="call-old /?"');
  expect(html).toContain('href="/recap"');
});
