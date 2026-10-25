import snapshot from '@/public/evaluation/repeat-review-v1.json';

export type Outcome = 'TP' | 'FP' | 'FN' | 'TN';
export type OutcomeFilter = Outcome | 'all';
export interface ReviewedItem {
  reviewItem: string; callNumber: number; kind: 'story' | 'question'; prompting: 'unprompted' | 'prompted' | 'uncertain';
  humanConfirmedRetelling: boolean; actualRepeat: boolean; predictedRepeat: boolean; outcome: Outcome;
  summary: string; similarity: number | null; currentQuote: string; priorQuote: string | null; priorItem: string | null;
  priorLinkCorrect: boolean | null; bestCandidateCorrect: boolean | null;
}
export const repeatReport = snapshot as Omit<typeof snapshot, 'items'> & { items: ReviewedItem[] };
export const outcomeNames: Record<Outcome, string> = { TP:'Repeat caught', FN:'Repeat missed', TN:'Correctly new', FP:'False alarm' };
export const selectItems = (items: ReviewedItem[], filter: OutcomeFilter) => filter === 'all' ? items : items.filter(i => i.outcome === filter);
export function summarize(items: ReviewedItem[]) {
  const counts = { TP:0, FP:0, FN:0, TN:0 };
  for (const item of items) counts[item.outcome]++;
  const { TP, FP, FN, TN } = counts;
  const divide = (a: number, b: number) => b ? a/b : null;
  return { ...counts, total:items.length, actualRepeats:TP+FN, flagged:TP+FP,
    precision:divide(TP,TP+FP), recall:divide(TP,TP+FN), accuracy:divide(TP+TN,items.length), f1:divide(2*TP,2*TP+FP+FN) };
}
export const percentage = (value: number | null) => value === null ? 'N/A' : `${Number((value*100).toFixed(1))}%`;
