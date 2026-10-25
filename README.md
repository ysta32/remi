# Remi

Remi notices changes in how someone talks over time, compared with their own usual, and helps
families know when it may be worth talking to a doctor.

## Idea

Speech research looks at interpretable features of everyday language: how varied the vocabulary is,
how simple the sentences are, how often general words replace specific ones, how fast someone types
or talks. A person's iMessage history is a dense, years-long, naturally occurring language sample.
This project explores extracting privacy-preserving linguistic features from that history and
comparing them with the person's own usual over time, to surface a change worth bringing to a clinician.

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
