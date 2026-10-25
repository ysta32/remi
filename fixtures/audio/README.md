# Audio fixtures for the voice markers

WAV files are **not committed**. They would be large, and real voices are personal data. Generate or record them locally.

- **Synthetic:** `web/lib/markers/__tests__/pitch.test.ts` builds tones and glides in code. No files are needed.
- **TTS check:** run `cd web && npx tsx scripts/pitch-check.mts`. OpenAI TTS reads one story twice, flat and then expressive, and the script prints `pitch_var` and `pitch_range` for each. It needs `OPENAI_API_KEY` in `web/.env.local`.
- **Your own recording** (e.g. on the demo Mac): record a voice memo, export it as WAV, then run `npx tsx scripts/pitch-check.mts --file /path/to/memo.wav`.
  - Any PCM or float WAV at any sample rate works. Stereo is mixed down.
  - On a Mac you can convert other formats with `afconvert -f WAVE -d LEI16 memo.m4a memo.wav`.
- **Through the pipeline:**
  1. Put a WAV at `<somewhere>/tmp/calls/<name>.wav`; the API only accepts `tmp/calls/*.wav`.
  2. POST a transcript fixture to `/api/agent/calls/:id/complete` with `"audioPath": "<absolute path>"`.
  3. The `acoustic` step writes the pitch markers and then deletes the file.

Pitch is **only** a sound measurement compared with the person's own usual. Never describe it as mood or emotion (see the claims policy).
