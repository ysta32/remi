import './evaluation.css';
import type { Metadata } from 'next';
import { RepeatEvaluation } from '@/components/evaluation/RepeatEvaluation';

export const metadata: Metadata = { title:'Remi · Reviewed repeat-detector evaluation', description:'24 of 30 repeats caught across 12 human-reviewed synthetic calls.' };
export default function EvaluationPage() {
  return <main><RepeatEvaluation /></main>;
}
