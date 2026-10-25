import './evaluation.css';
import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { RepeatEvaluation } from '@/components/evaluation/RepeatEvaluation';

export const metadata: Metadata = { title:'Remi · Reviewed repeat-detector evaluation', description:'Inspect 60 human-reviewed synthetic items, the frozen repeat-detection results, and the six misses.' };
export default function EvaluationPage() {
  return <><SiteNav variant="app" /><main><RepeatEvaluation /></main></>;
}
