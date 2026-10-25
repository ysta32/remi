import Link from 'next/link';
import { formatDay } from '@/lib/format';
import type { RepeatAnalysisView } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

export function RepeatDetections({ analysis, elderId }: { analysis: RepeatAnalysisView; elderId: string }) {
  const { counts, provenance } = analysis;
  return (
    <section aria-labelledby="repeat-detections" className="space-y-4 rounded-[28px] border border-line bg-card p-5">
      <h2 id="repeat-detections" className="text-[30px] font-black tracking-tight">Repeated stories and questions</h2>
      <p className="font-bold">{counts.total} repeats detected</p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-base">
        <li>Unprompted repeat: {counts.unprompted}</li>
        <li>Prompted retelling: {counts.prompted}</li>
        <li>Uncertain: {counts.uncertain}</li>
        <li>Stories: {counts.stories}</li>
        <li>Questions: {counts.questions}</li>
      </ul>
      <div className="text-base text-ink-2">
        <p>Compared with all earlier calls</p>
        <p>{analysis.analyzedCallCount} of {analysis.totalCallCount} calls analyzed</p>
        {analysis.status === 'partial' && <p className="font-bold">Some calls have not been analyzed. Counts cover analyzed calls only.</p>}
        {counts.total === 0 && <p>{analysis.status === 'partial' ? 'No repeats detected in analyzed calls at this threshold.' : 'No repeats detected at this threshold.'}</p>}
      </div>
      <details className="text-base text-ink-2">
        <summary className="cursor-pointer font-bold">How these comparisons were made</summary>
        <div className="mt-2 space-y-1 break-words">
          <p>Provisional threshold: {provenance.threshold}. Similarity measures how closely two extracted items match; it is not a probability.</p>
          <p>Extraction model: {provenance.extractionModel ?? 'Not recorded'}. Embedding model: {provenance.embeddingModel}. Detector version: {provenance.detectorVersion}.</p>
          <p>Prompted retelling can follow an invitation to share a story. These comparisons make no health assessment.</p>
        </div>
      </details>
      <div className="space-y-3">
        {analysis.matches.map((match, i) => (
          <details key={`${match.callId}:${match.priorCallId}:${i}`} className="rounded-2xl border border-line p-4">
            <summary className="cursor-pointer">
              <span className="font-bold">{match.label}</span> · {match.kind === 'story' ? 'Story' : 'Question'} · {formatDay(match.startedAt)}
              {match.isSimulated && <span className="ml-2 inline-block"><SimulatedBadge /></span>}
            </summary>
            <div className="mt-3 space-y-3">
              {match.summary && <p>{match.summary}</p>}
              <p className="text-base text-ink-2">Similarity: {match.similarity.toFixed(3)}</p>
              <div>
                <p className="font-bold">This call · {formatDay(match.startedAt)}</p>
                {match.quote ? <blockquote className="border-l-2 border-line pl-3">“{match.quote}”</blockquote> : <p className="text-ink-2">Evidence hidden by sharing choices.</p>}
              </div>
              <div>
                <p className="font-bold">Earlier call · {formatDay(match.priorStartedAt)}</p>
                {match.priorQuote ? <blockquote className="border-l-2 border-line pl-3">“{match.priorQuote}”</blockquote> : <p className="text-ink-2">Evidence hidden by sharing choices.</p>}
                <Link className="font-bold underline underline-offset-4" href={`/elders/${encodeURIComponent(elderId)}?call=${encodeURIComponent(match.priorCallId)}#${encodeURIComponent(`call-${match.priorCallId}`)}`}>View earlier call</Link>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
