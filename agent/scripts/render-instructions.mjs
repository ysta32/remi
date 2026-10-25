#!/usr/bin/env node
// Print the rendered call instructions for review.
//   node scripts/render-instructions.mjs [returning|first-call|demo|no-contact] [--v2]

import { readFileSync } from 'node:fs';
import { buildInstructions, openingInstructions } from '../brain/callflow.mjs';
import { resolveSafetyConfig } from '../brain/safety.mjs';

const contractV2 = process.argv.includes('--v2');
const fixture = contractV2 ? '../fixtures/context.v2.json' : '../fixtures/context.json';
const base = JSON.parse(readFileSync(new URL(fixture, import.meta.url), 'utf8'));
const variant = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'returning';

const variants = {
  returning: base,
  'first-call': {
    ...base,
    isFirstCall: true,
    lastCall: null,
    knownFacts: [],
    recentStories: [],
    consent: { ...base.consent, elderConfirmed: false },
  },
  demo: { ...base, demoMode: true },
  'no-contact': { ...base, emergency: null, family: { ...base.family } },
};
const ctx = variants[variant];
if (!ctx) {
  console.error(`unknown variant "${variant}"; use one of: ${Object.keys(variants).join(', ')}`);
  process.exit(2);
}

// Ignore the operator's env here so the output is reproducible.
const safety = resolveSafetyConfig(ctx, {});
const text = buildInstructions(ctx, { safety, now: new Date('2026-10-24T20:00:00Z'), contractV2 });

console.log('=== OPENING TURN ===');
console.log(openingInstructions(ctx));
console.log('\n=== INSTRUCTIONS ===');
console.log(text);
console.log(`\n(${text.split(/\s+/).length} words)`);
