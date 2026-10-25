// Two-key consent (contracts §3): effective[k] = proposed[k] && elder_k === 1. NULL (not asked) → false.
import type { ConsentKey, ConsentMap } from '../types';

/** A consents row in raw SQLite (snake_case) form. */
export interface ConsentRow {
  fam_summaries: number;
  fam_fun_facts: number;
  fam_speech_trends: number;
  fam_mood: number;
  elder_summaries: number | null;
  elder_fun_facts: number | null;
  elder_speech_trends: number | null;
  elder_mood: number | null;
}

export const CONSENT_KEYS: ConsentKey[] = ['summaries', 'funFacts', 'speechTrends', 'mood'];

export const FAM_COLUMN: Record<ConsentKey, keyof ConsentRow & `fam_${string}`> = {
  summaries: 'fam_summaries',
  funFacts: 'fam_fun_facts',
  speechTrends: 'fam_speech_trends',
  mood: 'fam_mood',
};

export const ELDER_COLUMN: Record<ConsentKey, keyof ConsentRow & `elder_${string}`> = {
  summaries: 'elder_summaries',
  funFacts: 'elder_fun_facts',
  speechTrends: 'elder_speech_trends',
  mood: 'elder_mood',
};

const NONE: ConsentMap = { summaries: false, funFacts: false, speechTrends: false, mood: false };

export function proposedConsent(row: ConsentRow | null | undefined): ConsentMap {
  if (!row) return { ...NONE };
  const out = { ...NONE };
  for (const k of CONSENT_KEYS) out[k] = row[FAM_COLUMN[k]] === 1;
  return out;
}

export function effectiveConsent(row: ConsentRow | null | undefined): ConsentMap {
  if (!row) return { ...NONE };
  const out = { ...NONE };
  for (const k of CONSENT_KEYS) out[k] = row[FAM_COLUMN[k]] === 1 && row[ELDER_COLUMN[k]] === 1;
  return out;
}

export function elderConfirmed(row: ConsentRow | null | undefined): boolean {
  if (!row) return false;
  return CONSENT_KEYS.every((k) => row[ELDER_COLUMN[k]] !== null && row[ELDER_COLUMN[k]] !== undefined);
}

export function consentView(row: ConsentRow | null | undefined): {
  proposed: ConsentMap;
  elderConfirmed: boolean;
  effective: ConsentMap;
} {
  return { proposed: proposedConsent(row), elderConfirmed: elderConfirmed(row), effective: effectiveConsent(row) };
}
