import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { repeatReport, summarize, selectItems } from '../repeat-report';
import { RepeatEvaluation } from '@/components/evaluation/RepeatEvaluation';
vi.stubGlobal('React', React);

it('derives the reviewed confusion matrix and honest denominators from all60 items', () => {
  const m = summarize(repeatReport.items);
  expect(m).toMatchObject({ TP:24, FP:0, FN:6, TN:30, total:60, actualRepeats:30, flagged:24, precision:1, recall:0.8, accuracy:0.9 });
  expect(m.f1).toBeCloseTo(8/9);
  expect(summarize(repeatReport.items.filter(i => i.kind === 'story'))).toMatchObject({ TP:16,FN:2,TN:18 });
  expect(summarize(repeatReport.items.filter(i => i.kind === 'question'))).toMatchObject({ TP:8,FN:4,TN:12 });
});
it('handles empty denominators and filters all outcomes without losing identities', () => {
  expect(summarize([])).toMatchObject({ precision:null,recall:null,accuracy:null,f1:null });
  expect(selectItems(repeatReport.items,'FN')).toHaveLength(6);
  expect(selectItems(repeatReport.items,'FP')).toEqual([]);
  expect(selectItems(repeatReport.items,'all')).toHaveLength(60);
  expect(new Set(repeatReport.items.map(i => i.reviewItem)).size).toBe(60);
});
it('keeps every saved flag at the frozen threshold with grounded earlier evidence', () => {
  const threshold = repeatReport.settings.threshold;
  expect(threshold).toBe(0.85);
  for (const item of repeatReport.items) {
    expect(item.predictedRepeat).toBe(item.similarity !== null && item.similarity >= threshold);
    expect(item.currentQuote.length).toBeGreaterThan(0);
    if (item.predictedRepeat || item.outcome === 'FN') {
      expect(item.priorQuote!.length).toBeGreaterThan(0);
      expect(Number(item.priorItem!.split('.')[0])).toBeLessThan(item.callNumber);
      expect(item.bestCandidateCorrect).toBe(true);
    }
  }
  expect(repeatReport.items.filter(i => i.predictedRepeat && i.priorLinkCorrect)).toHaveLength(24);
});
it('preserves the three human corrections without claiming their prompting is resolved', () => {
  for (const [id,outcome] of [['10.2','TP'],['10.5','FN'],['11.2','TP']]) {
    expect(repeatReport.items.find(i => i.reviewItem === id)).toMatchObject({ actualRepeat:true,humanConfirmedRetelling:true,prompting:'uncertain',outcome });
  }
});
it('renders scoped scores, all evidence, limitations, denominators and portable download', () => {
  const html = renderToStaticMarkup(React.createElement(RepeatEvaluation));
  for (const text of ['Synthetic','24','30','100%','80%','90%','88.9%','not an untouched holdout','Prompting unclear','Confirmed retelling','Stanley','/evaluation/repeat-review-v1.json']) expect(html).toContain(text);
  expect(html).not.toContain('clinical accuracy');
  expect(html).not.toContain('100% accurate');
  expect(html).not.toContain('embeddingDimensions');
});
