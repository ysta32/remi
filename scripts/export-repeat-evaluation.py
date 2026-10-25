#!/usr/bin/env python3
"""Export fictional, reviewed evidence only. Offline; immutable inputs; refuses overwrite.

python3 scripts/export-repeat-evaluation.py --review-directory /path/to/evaluation-review \
  --snapshot /path/to/checkpoint/snapshot --output /fresh/path/repeat-review-v1.json
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import sqlite3


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def export(review, snapshot):
    report_path = review / 'evaluation-results-v3.json'
    report = read(report_path)
    freeze = read(snapshot / 'detector-freeze.json')
    manifest_path = snapshot / 'corpus/manifest.json'
    manifest = read(manifest_path)
    confirmation = read(review / 'human-review-confirmation.json')
    corrections_path = review / 'human-reviewed-label-corrections.json'
    corrections = read(corrections_path)
    require(digest(manifest_path) == freeze['corpusManifestSha256'] == confirmation['corpusManifestSha256'], 'Corpus changed')
    require(digest(review / 'human-review-confirmation.json') == report['reviewConfirmationSha256'], 'Review confirmation changed')
    require(digest(corrections_path) == report['displayedLabelCorrectionsSha256'], 'Reviewed corrections changed')
    require(report['settings'] == freeze['settings'] and report['settings']['isSimulated'] is True, 'Settings or provenance changed')
    require(report['codeCommit'] == freeze['codeCommit'] and report['corpusHash'] == freeze['corpusHash'], 'Checkpoint changed')
    for relative, expected in manifest['files'].items():
        path = Path(relative)
        require(not path.is_absolute() and '..' not in path.parts, 'Unsafe manifest path')
        require(digest(snapshot / 'corpus' / path) == expected, 'Corpus file changed')
    database = snapshot / 'synthetic-transcripts-demo.db'
    require(digest(database) == freeze['databaseSnapshotSha256'], 'Saved predictions changed')
    with sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True) as db:
        saved = db.execute('SELECT call_id, result_json FROM detector_results').fetchall()
    require({cid for cid, _ in saved} == set(manifest['callIds']), 'Incomplete predictions')
    results, items, truth = {}, {}, {}
    numbers = {cid: n for n, cid in enumerate(manifest['callIds'], 1)}
    for cid, raw in saved:
        require(hashlib.sha256(raw.encode()).hexdigest() == freeze['savedResults']['resultSha256ByCall'][cid], 'Prediction hash mismatch')
        result = json.loads(raw)
        require(result['status'] == 'ok' and result['provenance'] == report['settings'], 'Invalid prediction provenance')
        results[cid] = result
        call = read(snapshot / 'corpus/calls' / f'{cid}.json')
        require(call['isSimulated'] is True, 'Only fictional data may be published')
        occurrences = read(snapshot / 'corpus/ground-truth' / f'{cid}.json')['occurrences']
        for n, occurrence in enumerate(occurrences, 1):
            truth[occurrence['occurrenceId']] = (f'{numbers[cid]}.{n}', occurrence)
        for item in result['items']:
            aligned = [o for o in occurrences if o['sourceTurnIndex'] == item['sourceTurnIndex'] and item['quote'] and item['quote'] in o['quote']]
            require(len(aligned) == 1, 'Ambiguous item alignment')
            turn = call['utterances'][item['sourceTurnIndex']]
            require(turn['speaker'] == 'caller' and item['quote'] in turn['text'], 'Ungrounded quote')
            require(item['id'] not in items, 'Duplicate item')
            items[item['id']] = (item, aligned[0])
    corrected = {c['reviewItem'] for c in corrections['changes']}
    exported, seen = [], set()
    for row in report['rows']:
        item, occurrence = items[row['itemId']]
        review_item, _ = truth[occurrence['occurrenceId']]
        require(row['reviewItem'] == review_item and review_item not in seen, 'Duplicate or incorrect review ID')
        seen.add(review_item)
        require(row['callId'] == item['callId'] and row['actualRepeat'] == occurrence['isRepeat'] and row['kind'] == occurrence['kind'], 'Reviewed label mismatch')
        require(row['summary'] == item['summary'], 'Summary mismatch')
        prediction = next(m for m in results[item['callId']]['matches'] if m['itemId'] == item['id'])
        positive = prediction['isRepeat']
        require(row['predictedRepeat'] == positive and row['similarity'] == prediction['similarity'], 'Decision mismatch')
        require(positive == (prediction['similarity'] is not None and prediction['similarity'] >= report['settings']['threshold']), 'Threshold mismatch')
        outcome = ('TP' if positive else 'FN') if occurrence['isRepeat'] else ('FP' if positive else 'TN')
        require(outcome == row['outcome'], 'Outcome mismatch')
        prior_id = prediction['matchedItemId'] if positive else prediction['candidateItemId']
        prior, prior_occurrence = items[prior_id] if prior_id else (None, None)
        correct = None
        if prior:
            require(numbers[prior['callId']] < numbers[item['callId']], 'Non-prior evidence')
            correct = any(p['callId'] == prior['callId'] and p['occurrenceId'] == prior_occurrence['occurrenceId'] for p in occurrence['priorOccurrences'])
            require(correct == row['bestCandidateCorrect'] if occurrence['isRepeat'] else True, 'Candidate validation mismatch')
        require(row['priorLinkCorrect'] == (correct if positive else None), 'Prior link mismatch')
        exported.append({
            'reviewItem': review_item, 'callNumber': numbers[item['callId']], 'kind': occurrence['kind'],
            'prompting': occurrence['elicitation'], 'humanConfirmedRetelling': review_item in corrected,
            'actualRepeat': occurrence['isRepeat'], 'predictedRepeat': positive, 'outcome': outcome,
            'summary': item['summary'], 'similarity': prediction['similarity'], 'currentQuote': item['quote'],
            'priorQuote': prior['quote'] if prior else None,
            'priorItem': truth[prior_occurrence['occurrenceId']][0] if prior else None,
            'priorLinkCorrect': correct if positive else None, 'bestCandidateCorrect': correct,
        })
    counts = collections.Counter(i['outcome'] for i in exported)
    require(len(exported) == len(items) == len(truth) == confirmation['occurrences'] == 60, 'Incomplete alignment')
    require(all(counts[k] == report['metrics'][k] for k in ('TP','FP','FN','TN')), 'Metrics mismatch')
    require(set(corrected) == {'10.2','10.5','11.2'} and all(i['actualRepeat'] for i in exported if i['humanConfirmedRetelling']), 'Review corrections mismatch')
    return {
        'schemaVersion': 1, 'isSimulated': True, 'title': 'Reviewed synthetic repeat evaluation',
        'callCount': len(manifest['callIds']), 'weeks': 4, 'personas': 1, 'reviewerCount': 1,
        'evaluatedAt': report['evaluatedAt'], 'reviewedAt': corrections['recordedAt'],
        'checkpointId': report['checkpointId'], 'codeCommit': report['codeCommit'],
        'settings': report['settings'], 'sourceReportSha256': digest(report_path),
        'corpusHash': report['corpusHash'], 'reviewCorrectionsSha256': digest(corrections_path),
        'items': exported,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review-directory', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = export(args.review_directory, args.snapshot)
    with args.output.open('x') as out:
        json.dump(result, out, indent=2, ensure_ascii=False)
        out.write('\n')
    print(f"Exported {len(result['items'])} reviewed fictional items; no model calls.")
