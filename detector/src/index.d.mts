import type {
  AnalysisInput, AnalysisResult, Call, ExtractedItem, EmbeddedItem, SavedItem,
  ItemIdentity, OpenAIOptions, Candidate, RepeatCounts, Match, DetectorErrorCode,
} from './types.d.ts';
export type * from './types.d.ts';

export class DetectorError extends Error {
  constructor(code: DetectorErrorCode, message: string);
  code: DetectorErrorCode;
}
export function parseCall(value: unknown): Call;
export function parseHistory(value: unknown): SavedItem[];
export function makeItemId(identity: ItemIdentity): string;
export function postOpenAI(path: '/responses' | '/embeddings', body: unknown, options?: OpenAIOptions): Promise<unknown>;
export function extractItems(call: Call, options?: OpenAIOptions): Promise<{
  items: ExtractedItem[];
  extractionModel: string | null;
  promptVersion: 'remi-items-v1';
}>;
export function embedItems(items: ExtractedItem[], options?: OpenAIOptions): Promise<EmbeddedItem[]>;
export function prepareHistory(history: SavedItem[], options?: OpenAIOptions): Promise<EmbeddedItem[]>;
export function cosineSimilarity(a: number[], b: number[]): number;
export function findCandidates(current: EmbeddedItem[], history: EmbeddedItem[]): Candidate[];
export function classifyCandidates(candidates: Candidate[], options?: { threshold?: number }): {
  matches: Match[];
  counts: RepeatCounts;
  threshold: number;
};
export function analyzeCall(input: AnalysisInput, options?: OpenAIOptions & { threshold?: number }): Promise<AnalysisResult>;
