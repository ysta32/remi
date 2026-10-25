'use client';

import { useState } from 'react';
import { outcomeNames, percentage, repeatReport as report, selectItems, summarize, type Outcome, type OutcomeFilter } from '@/lib/evaluation/repeat-report';

const tones: Record<Outcome,string> = { TP:'eval-caught', FN:'eval-missed', TN:'eval-newItem', FP:'eval-falseAlarm' };
const prompting = { unprompted:'Unprompted', prompted:'Prompted', uncertain:'Prompting unclear' };
const metrics = summarize(report.items);
const misses = report.items.filter(i => i.outcome === 'FN');
const correctLinks = report.items.filter(i => i.predictedRepeat && i.priorLinkCorrect).length;

export function RepeatEvaluation() {
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const [selectedId, setSelectedId] = useState('10.5');
  const visible = selectItems(report.items,filter);
  const selected = visible.find(i => i.reviewItem === selectedId) ?? visible[0];
  function chooseItem(id: string) { setFilter('all'); setSelectedId(id); }
  return (
    <div className={'eval-report'}>
      <header className={'eval-header'}>
        <div className={'eval-eyebrow'}><span className={'eval-badge'}>Synthetic · human reviewed</span><span>Repeat detector / evaluation 01</span></div>
        <h1>Did we catch the<br /><span>same story twice?</span></h1>
        <p className={'eval-intro'}>One fictional grandpa. Four weeks of calls. Every story and question reviewed by a human, then checked against the detector&apos;s saved predictions.</p>
        <div className={'eval-actions'}>
          <a href="#evidence" className={'eval-primary'}>Inspect the evidence <span aria-hidden="true">↗</span></a>
          <button onClick={() => window.print()} className={'eval-secondary'}>Print / save PDF</button>
          <a href="/evaluation/repeat-review-v1.json" download className={'eval-secondary'}>Download results ↓</a>
        </div>
      </header>

      <section className={'eval-hero'} aria-label="Repeat detection result">
        <div className={'eval-heroNumber'}>
          <p className={'eval-overline'}>Known repeats caught</p>
          <div className={'eval-fraction'}>{metrics.TP}<span>/ {metrics.actualRepeats}</span></div>
          <p className={'eval-heroCaption'}><strong>{percentage(metrics.recall)} recall.</strong> Six repeats slipped through.</p>
          <p className={'eval-heroNote'}>Of the {metrics.flagged} items flagged as repeats, all {metrics.TP} were correct in this reviewed corpus.</p>
        </div>
        <div className={'eval-heroGrid'}>
          <div className={'eval-sectionTop'}><h2>All {metrics.total} reviewed items</h2><span>{report.callCount} calls · {report.weeks} weeks</span></div>
          <div className={'eval-waffle'} aria-label="Outcome for each reviewed item; select one to inspect its evidence">
            {report.items.map(item => <a key={item.reviewItem} href="#evidence" onClick={() => chooseItem(item.reviewItem)} className={`${'eval-tile'} ${tones[item.outcome]}`} aria-label={`Item ${item.reviewItem}, ${item.kind}: ${outcomeNames[item.outcome]}`} title={`Item ${item.reviewItem} · ${outcomeNames[item.outcome]}`}>{item.reviewItem}</a>)}
          </div>
          <div className={'eval-legend'}>{(['TP','FN','TN','FP'] as Outcome[]).map(outcome => <span key={outcome}><i className={tones[outcome]} aria-hidden="true" />{metrics[outcome]} {outcomeNames[outcome].toLowerCase()}</span>)}</div>
          <p className={'eval-small'}>Each square is one reviewed story or question. Select any square to see the source excerpts.</p>
        </div>
      </section>

      <div className={'eval-scope'}><strong>What this measures:</strong> repeat matching on 12 synthetic calls. Preliminary evidence, not an untouched holdout, a medical result, or a real-call performance estimate.</div>

      <section aria-labelledby="numbers-title" className={'eval-section'}>
        <div className={'eval-sectionTop'}><h2 id="numbers-title">The numbers, with their denominators.</h2><span>Fixed similarity threshold {report.settings.threshold.toFixed(2)}</span></div>
        <div className={'eval-metrics'}>
          {[{ value:percentage(metrics.precision), name:'Precision', fraction:`${metrics.TP} / ${metrics.flagged} flags correct`, detail:'When we said “repeat,” were we right?' },
            { value:percentage(metrics.recall), name:'Recall', fraction:`${metrics.TP} / ${metrics.actualRepeats} repeats caught`, detail:'How many real repeats in this corpus did we catch?' },
            { value:percentage(metrics.accuracy), name:'Overall accuracy', fraction:`${metrics.TP+metrics.TN} / ${metrics.total} decisions correct`, detail:'Correct repeat and new-item decisions together.' },
            { value:percentage(metrics.f1), name:'F1 score', fraction:'2 × precision × recall / (precision + recall)', detail:'A combined measure of precision and recall.' }].map(stat => <article className={'eval-metric'} key={stat.name}><p>{stat.name}</p><strong>{stat.value}</strong><b>{stat.fraction}</b><span>{stat.detail}</span></article>)}
        </div>
        <div className={'eval-twoColumns'}>
          <div className={'eval-panel'}>
            <h3>Human review × detector decision</h3>
            <table className={'eval-matrix'}><caption className={'eval-srOnly'}>Confusion matrix of 60 reviewed synthetic items</caption><thead><tr><th scope="col">Human review</th><th scope="col">Flagged repeat</th><th scope="col">Not flagged</th></tr></thead><tbody>
              <tr><th scope="row">Repeated content</th><td className={'eval-caught'}><strong>{metrics.TP}</strong><span>Caught · true positive</span></td><td className={'eval-missed'}><strong>{metrics.FN}</strong><span>Missed · false negative</span></td></tr>
              <tr><th scope="row">New content</th><td className={'eval-falseAlarm'}><strong>{metrics.FP}</strong><span>False positive</span></td><td className={'eval-newItem'}><strong>{metrics.TN}</strong><span>Correct · true negative</span></td></tr>
            </tbody></table>
          </div>
          <div className={'eval-panel'}>
            <h3>Stories were easier than questions.</h3>
            {(['story','question'] as const).map(kind => { const m = summarize(report.items.filter(i => i.kind === kind)); return <div className={'eval-kind'} key={kind}><div><strong>{kind === 'story' ? 'Stories' : 'Questions'}</strong><span>{m.TP} / {m.actualRepeats} caught · {percentage(m.recall)}</span></div><div className={'eval-track'} role="img" aria-label={`${m.TP} of ${m.actualRepeats} repeated ${kind === 'story' ? 'stories' : 'questions'} caught`}><span style={{ width:`${(m.recall ?? 0)*100}%` }} /></div><p>{m.FN} missed · {m.FP} false alarms</p></div>; })}
            <div className={'eval-linkStat'}><strong>{correctLinks} / {metrics.flagged}</strong><span>flagged repeats linked to a correct earlier telling.</span></div>
          </div>
        </div>
      </section>

      <section className={'eval-section'} aria-labelledby="misses-title">
        <div className={'eval-sectionTop'}><div><p className={'eval-overline'}>Where it fell short</p><h2 id="misses-title">Six near matches. Six missed repeats.</h2></div></div>
        <p className={'eval-description'}>For all six, the closest earlier candidate was the correct incident. Their similarity scores fell below the fixed 0.85 cutoff, so the detector did not flag them. This suggests a next experiment; lowering the cutoff on this same corpus would not be an independent validation.</p>
        <div className={'eval-missPlot'}>
          <div className={'eval-axis'} aria-hidden="true"><span>Cosine similarity · 0</span><span>1.00</span></div>
          {misses.map(item => <button key={item.reviewItem} onClick={() => { chooseItem(item.reviewItem); document.getElementById('evidence')?.scrollIntoView({ behavior:'smooth' }); }} className={'eval-missRow'} aria-label={`Inspect missed ${item.kind} ${item.reviewItem}, similarity ${item.similarity!.toFixed(3)}`}><span>Item {item.reviewItem}<small>{item.kind}</small></span><span className={'eval-missTrack'} aria-hidden="true"><i style={{ width:`${item.similarity!*100}%` }} /><b style={{ left:`${report.settings.threshold*100}%` }} /></span><strong>{item.similarity!.toFixed(3)}</strong></button>)}
          <p className={'eval-small'}>Vertical line = 0.85 cutoff. Similarity is a comparison score, not a probability.</p>
        </div>
      </section>

      <section id="evidence" className={'eval-section'} aria-labelledby="evidence-title">
        <div className={'eval-sectionTop'}><div><p className={'eval-overline'}>From score to source</p><h2 id="evidence-title">Inspect any decision.</h2></div><span>Fictional transcript excerpts</span></div>
        <div className={'eval-filters'} role="group" aria-label="Filter reviewed items">
          {(['all','TP','FN','TN','FP'] as OutcomeFilter[]).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? `All ${metrics.total}` : `${outcomeNames[value]} · ${metrics[value]}`}</button>)}
        </div>
        <div className={'eval-explorer'}>
          <div className={'eval-itemList'} aria-label="Reviewed items">
            <p>{visible.length} {visible.length === 1 ? 'item' : 'items'} in this view</p>
            {visible.map(item => <button key={item.reviewItem} onClick={() => setSelectedId(item.reviewItem)} aria-pressed={selected?.reviewItem === item.reviewItem}><span>Item {item.reviewItem} · {item.kind}</span><i className={tones[item.outcome]}>{outcomeNames[item.outcome]}</i></button>)}
          </div>
          {selected ? <article className={'eval-evidenceCard'} aria-label={`Evidence for item ${selected.reviewItem}`}>
            <div className={'eval-sectionTop'}><h3>Item {selected.reviewItem} · {selected.kind}</h3><span className={`${'eval-tag'} ${tones[selected.outcome]}`}>{outcomeNames[selected.outcome]}</span></div>
            <div className={'eval-decision'}><p><span>Human review</span><strong>{selected.actualRepeat ? 'Confirmed retelling' : 'New content'}</strong></p><p><span>Detector decision</span><strong>{selected.predictedRepeat ? 'Repeat flagged' : 'Not flagged'}</strong></p><p><span>Best similarity / cutoff</span><strong>{selected.similarity === null ? 'No earlier candidate' : `${selected.similarity.toFixed(3)} / ${report.settings.threshold.toFixed(2)}`}</strong></p></div>
            <p className={'eval-promptNote'}>{prompting[selected.prompting]}{selected.humanConfirmedRetelling && ' · Human explicitly confirmed this retelling.'}{selected.prompting === 'uncertain' && ' “Unclear” refers to prompting, not whether the content repeated.'}</p>
            <div className={'eval-quotes'}><div><p>Current excerpt · call {selected.callNumber}</p><blockquote>{selected.currentQuote}</blockquote></div><div><p>{selected.predictedRepeat ? 'Linked earlier telling' : 'Closest earlier candidate'}{selected.priorItem && ` · item ${selected.priorItem}`}</p>{selected.priorQuote ? <blockquote>{selected.priorQuote}</blockquote> : <p className={'eval-small'}>No eligible earlier candidate was available.</p>}{selected.priorItem && <button className={'eval-textButton'} onClick={() => chooseItem(selected.priorItem!)}>Inspect item {selected.priorItem} →</button>}</div></div>
            {selected.outcome === 'FN' && <p className={'eval-explanation'}>A correct earlier candidate was found, but the score was below 0.85. This counts as a missed repeat.</p>}
            <details className={'eval-summary'}><summary>Detector&apos;s extracted summary</summary><p>{selected.summary}</p></details>
          </article> : <div className={'eval-empty'} role="status"><strong>No false alarms in this reviewed corpus.</strong><p>All 30 new items were left unflagged. This does not establish a zero false-alarm rate on future calls.</p></div>}
        </div>
      </section>

      <section className={'eval-method'} aria-labelledby="method-title">
        <div><p className={'eval-overline'}>How we checked it</p><h2 id="method-title">Planted. Reviewed. Compared.</h2></div>
        <ol>{[
          ['Generate the calls','Code creates one fictional persona and 12 calls over four weeks, with known repeat incidents and new material. Labels stay separate from detector inputs.'],
          ['Run and freeze the detector','Extract stories and questions, embed their summaries, and compare with the same kind of item in earlier calls. Save predictions at threshold 0.85.'],
          ['Review the labels','One human reviewed the 60 planted items and confirmed the labels in conversation. Items 10.2, 10.5 and 11.2 were explicitly confirmed as retellings; prompting remains unclear.'],
          ['Score the saved predictions','Align 60 extracted items one-to-one with reviewed occurrences using source turns and quotes. Count every decision and separately check earlier links. No model rerun or threshold tuning.'],
        ].map(([title,body],i) => <li key={title}><span>{String(i+1).padStart(2,'0')}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
        <div className={'eval-limits'}><h3>What remains to test</h3><p>This small corpus was previously inspected. It is not an untouched holdout and has no independent second human reviewer. These results do not measure prompting-classification accuracy, audio analysis, or medical outcomes.</p><p><strong>Next:</strong> freeze any revised settings, then test new incident families and realistic negatives. Stanley is handling the separate FaceTime check; its result is not included here.</p></div>
        <details className={'eval-provenance'}><summary>Frozen run and source provenance</summary><dl><dt>Extraction</dt><dd>{report.settings.extractionModel} · {report.settings.promptVersion}</dd><dt>Embeddings</dt><dd>{report.settings.embeddingModel} · {report.settings.embeddingDimensions} dimensions</dd><dt>Detector</dt><dd>{report.settings.detectorVersion} · threshold {report.settings.threshold}</dd><dt>Checkpoint</dt><dd>{report.checkpointId}</dd><dt>Code commit</dt><dd>{report.codeCommit}</dd><dt>Scored report SHA-256</dt><dd>{report.sourceReportSha256}</dd><dt>Label correction SHA-256</dt><dd>{report.reviewCorrectionsSha256}</dd></dl></details>
      </section>
      <aside className={'eval-pitch'}><p className={'eval-overline'}>The 15-second explanation</p><p>“On 12 synthetic calls reviewed by a human, we caught 24 of 30 repeated stories and questions with no false alarms. All 24 flags linked to a correct earlier telling. The six misses show exactly what we need to improve next.”</p></aside>
      <footer className={'eval-footer'}>Repeat-matching evaluation · 25 October 2026 · Synthetic data only<br />Remi is not a medical device and does not diagnose anything.</footer>
    </div>
  );
}
