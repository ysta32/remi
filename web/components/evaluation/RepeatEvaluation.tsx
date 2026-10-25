import Image from 'next/image';

export function RepeatEvaluation() {
  return (
    <figure className="eval-report">
      <Image
        src="/evaluation/repeat-results.svg"
        alt="Known repeats caught: 24 / 30 (80% recall). All 60 reviewed items: 24 repeats caught, 6 missed, 30 correctly new, 0 false alarms. 12 synthetic calls over 4 weeks."
        width={1060}
        height={414}
        unoptimized
        className="eval-graphic"
      />
      <figcaption className="eval-scope"><strong>What this measures:</strong> repeat matching on 12 synthetic calls. Preliminary evidence, not an untouched holdout, a medical result, or a real-call performance estimate.</figcaption>
    </figure>
  );
}
