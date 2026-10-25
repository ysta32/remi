#!/usr/bin/env node
// Lists the realtime/tts/transcribe model ids this OPENAI_API_KEY can use (ids only).
//   npm run models
const r = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` } });
if (!r.ok) { console.error(`models: HTTP ${r.status}`); process.exit(1); }
const ids = (await r.json()).data.map((m) => m.id).filter((id) => /realtime|tts|transcribe/.test(id)).sort();
console.log(ids.join('\n'));
