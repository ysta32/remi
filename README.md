# Hack PSU — Alzheimer Detection via iMessage

Early-signal detection of cognitive decline from longitudinal iMessage conversation data.

## Idea

Language changes early in Alzheimer's disease — vocabulary narrows, syntax simplifies, pronouns replace
nouns, typing slows and corrections increase. A person's iMessage history is a dense, years-long,
naturally occurring language sample. This project explores extracting privacy-preserving linguistic
features from that history and tracking them over time to surface a trend worth bringing to a clinician.

**This is a hackathon research project, not a diagnostic tool.**

## Planned pipeline

1. **Ingest** — read the local `chat.db` (macOS Messages) on-device, sender's own messages only.
2. **Feature extraction** — lexical diversity (TTR, MATTR), mean utterance length, syntactic depth,
   pronoun-to-noun ratio, filler/vagueness rate, repetition, inter-message latency, edit/typo rate.
3. **Longitudinal modeling** — per-person baseline, then trend detection over months/years.
4. **Report** — a plain-language trend view, plus an explicit "talk to a doctor" framing.

## Privacy

- All processing stays on-device by default; raw message text never leaves the machine.
- Only aggregate features are persisted.
- Explicit opt-in before any data is read.

## Status

Scaffolding. See issues for the task breakdown.

## Disclaimer

Not a medical device. Does not diagnose Alzheimer's disease or any condition. Outputs are
exploratory signals only and must not be used for clinical decisions.
