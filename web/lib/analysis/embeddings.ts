// Embeddings adapter for story repetition (echo-docs/echo-docs/docs/markers.md §6).
// EMBEDDINGS_PROVIDER=openai uses the embeddings endpoint; `none` throws EmbeddingsDisabledError
// so the caller falls back to matchStories() in llm.ts; gemini is not configured.
import { config } from '@/lib/config';
import { getOpenAI } from './llm';

export class EmbeddingsDisabledError extends Error {
  constructor() {
    super('EMBEDDINGS_PROVIDER=none: use matchStories() instead');
    this.name = 'EmbeddingsDisabledError';
  }
}

export type EmbeddingsTransport = (texts: string[]) => Promise<number[][]>;

export const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';
const embedModel = () => process.env.OPENAI_EMBED_MODEL || DEFAULT_EMBED_MODEL;

const openaiTransport: EmbeddingsTransport = async (texts) => {
  const res = await getOpenAI().embeddings.create({ model: embedModel(), input: texts, encoding_format: 'float' });
  return [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
};

const defaultTransport: EmbeddingsTransport = (texts) => {
  const provider = config.embeddingsProvider;
  if (provider === 'openai') return openaiTransport(texts);
  if (provider === 'none') throw new EmbeddingsDisabledError();
  throw new Error(`${provider} provider not configured`);
};

let transport: EmbeddingsTransport = defaultTransport;
/** Test hook: replace the provider call. Pass null to restore the real provider. */
export function setEmbeddingsTransportForTests(fn: EmbeddingsTransport | null): void {
  transport = fn ?? defaultTransport;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const vectors = await transport(texts);
  if (vectors.length !== texts.length) {
    throw new Error(`embeddings: expected ${texts.length} vectors, got ${vectors.length}`);
  }
  return vectors;
}

/** Cosine similarity; 0 if either vector has zero length or norm. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`cosine: length mismatch ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
