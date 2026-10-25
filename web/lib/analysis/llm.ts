// LLM adapter: post-call extraction and the story-matching fallback.
// Provider: LLM_PROVIDER=openai (Responses API + Structured Outputs). gemini is not configured.
import OpenAI from 'openai';
import { z } from 'zod';
import { config } from '@/lib/config';
import type { Utterance } from '@/lib/types';
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  buildMatchUserPrompt,
  buildRetryNote,
  MATCH_SYSTEM_PROMPT,
  type ExtractionPromptContext,
} from './prompts';

export const Extraction = z.object({
  summary: z.string().max(900),
  funFacts: z.array(z.object({ text: z.string().max(200), quote: z.string().max(200), questionId: z.string().nullable() })).max(4),
  topics: z.array(z.object({ kind: z.enum(['story', 'question']), summary: z.string().max(140), initiatedBy: z.enum(['caller', 'agent']) })).max(8),
  mood: z.object({ label: z.enum(['positive', 'neutral', 'low']), score: z.number().min(-1).max(1), evidence: z.array(z.string().max(160)).max(3) }),
  familyQuestionAnswers: z.array(z.object({ questionId: z.string(), answer: z.string().max(300) })),
  safetyMentioned: z.boolean(),
});
export type Extraction = z.infer<typeof Extraction>;

// ---------- transport ----------

export interface LlmRequest {
  system: string;
  user: string;
  schemaName: string;
  /** JSON Schema (Structured Outputs strict subset). */
  schema: Record<string, unknown>;
}
/** Returns the model's raw text output (expected to be JSON). */
export type LlmTransport = (req: LlmRequest) => Promise<string>;

let openaiClient: OpenAI | null = null;
/** Lazily created so importing this module never needs a key. Reads OPENAI_API_KEY from env. */
export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export const DEFAULT_EXTRACT_MODEL = 'gpt-6.1-sol';
const extractModel = () => process.env.OPENAI_EXTRACT_MODEL || DEFAULT_EXTRACT_MODEL;

const openaiTransport: LlmTransport = async (req) => {
  const res = await getOpenAI().responses.create({
    model: extractModel(),
    instructions: req.system,
    input: req.user,
    text: { format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: true } },
  });
  return res.output_text;
};

const defaultTransport: LlmTransport = (req) => {
  const provider = config.llmProvider;
  if (provider === 'openai') return openaiTransport(req);
  throw new Error(`${provider} provider not configured`);
};

let transport: LlmTransport = defaultTransport;
/** Test hook: replace the provider call. Pass null to restore the real provider. */
export function setLlmTransportForTests(fn: LlmTransport | null): void {
  transport = fn ?? defaultTransport;
}

// ---------- JSON schemas sent to the provider ----------
// Strict mode: every property required, additionalProperties false. String length limits are
// stated in the prompt and enforced by zod (a violation triggers the one retry).

const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) });
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const EXTRACTION_JSON_SCHEMA = obj({
  summary: str('3-5 sentences, max 900 characters'),
  funFacts: {
    type: 'array',
    maxItems: 4,
    items: obj({
      text: str('max 200 characters'),
      quote: str("caller's own words, original language, max 200 characters"),
      questionId: { type: ['string', 'null'] },
    }),
  },
  topics: {
    type: 'array',
    maxItems: 8,
    items: obj({
      kind: { type: 'string', enum: ['story', 'question'] },
      summary: str('max 140 characters'),
      initiatedBy: { type: 'string', enum: ['caller', 'agent'] },
    }),
  },
  mood: obj({
    label: { type: 'string', enum: ['positive', 'neutral', 'low'] },
    score: { type: 'number', minimum: -1, maximum: 1 },
    evidence: { type: 'array', maxItems: 3, items: str('max 160 characters') },
  }),
  familyQuestionAnswers: {
    type: 'array',
    items: obj({ questionId: str(), answer: str('max 300 characters') }),
  },
  safetyMentioned: { type: 'boolean' },
});

const MatchResult = z.object({
  matches: z.array(z.object({ newId: z.string(), matchId: z.string().nullable() })),
});
const MATCH_JSON_SCHEMA = obj({
  matches: {
    type: 'array',
    items: obj({ newId: str(), matchId: { type: ['string', 'null'] } }),
  },
});

// ---------- validated call with one retry ----------

function parseWith<T>(schema: z.ZodType<T>, raw: string): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `Output was not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = schema.safeParse(json);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    error: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'),
  };
}

async function callValidated<T>(schema: z.ZodType<T>, req: LlmRequest): Promise<T> {
  const first = parseWith(schema, await transport(req));
  if (first.ok) return first.value;
  const second = parseWith(
    schema,
    await transport({ ...req, user: `${req.user}\n\n${buildRetryNote(first.error)}` }),
  );
  if (second.ok) return second.value;
  throw new Error(`${req.schemaName} output failed validation twice: ${second.error}`);
}

// ---------- public API ----------

export type ExtractContext = ExtractionPromptContext;

export async function extractCall(utterances: Utterance[], ctx: ExtractContext): Promise<Extraction> {
  return callValidated(Extraction, {
    system: buildExtractionSystemPrompt(ctx),
    user: buildExtractionUserPrompt(utterances),
    schemaName: 'call_extraction',
    schema: EXTRACTION_JSON_SCHEMA,
  });
}

/**
 * LLM fallback for repetition matching (EMBEDDINGS_PROVIDER=none), echo-docs/echo-docs/docs/markers.md §6.4.
 * Returns, for each new story id, the id of a matching candidate or null.
 */
export async function matchStories(
  newStories: { id: string; summary: string }[],
  candidates: { id: string; summary: string }[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = Object.fromEntries(newStories.map((s) => [s.id, null]));
  if (newStories.length === 0 || candidates.length === 0) return out;

  const result = await callValidated(MatchResult, {
    system: MATCH_SYSTEM_PROMPT,
    user: buildMatchUserPrompt(newStories, candidates),
    schemaName: 'story_matches',
    schema: MATCH_JSON_SCHEMA,
  });
  const candidateIds = new Set(candidates.map((c) => c.id));
  for (const m of result.matches) {
    if (m.newId in out && m.matchId !== null && candidateIds.has(m.matchId)) out[m.newId] = m.matchId;
  }
  return out;
}
