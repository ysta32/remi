export type Speaker = 'caller' | 'agent';
export type ItemKind = 'story' | 'question';
export type Elicitation = 'unprompted' | 'prompted' | 'uncertain';
export interface Utterance {
  speaker: Speaker;
  text: string;
  startMs?: number;
  endMs?: number;
}
export interface Call {
  elderId: string;
  callId: string;
  startedAt: string;
  isSimulated: boolean;
  utterances: Utterance[];
}
export interface ExtractedItem {
  id: string;
  elderId: string;
  callId: string;
  startedAt: string;
  isSimulated: boolean;
  kind: ItemKind;
  summary: string;
  quote: string;
  sourceTurnIndex: number;
  elicitation: Elicitation;
  promptTurnIndex: number | null;
}
export interface EmbeddedItem extends ExtractedItem {
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
  extractionModel?: string;
  promptVersion?: string;
}
export type SavedItem = ExtractedItem & {
  extractionModel?: string;
  promptVersion?: string;
} & (
  | { embedding: number[]; embeddingModel: string; embeddingDimensions: number }
  | { embedding?: null; embeddingModel?: null; embeddingDimensions?: null }
);
export interface ItemIdentity {
  elderId: string;
  callId: string;
  kind: ItemKind;
  sourceTurnIndex: number;
  quote: string;
}
export type DetectorErrorCode = 'INVALID_INPUT' | 'INVALID_HISTORY' | 'CONFIGURATION_ERROR' | 'PROVIDER_ERROR' | 'PROVIDER_TIMEOUT' | 'INVALID_RESPONSE' | 'EXTRACTION_REFUSED' | 'EXTRACTION_INCOMPLETE' | 'INCOMPATIBLE_EMBEDDINGS' | 'CONSENT_REQUIRED';
export interface OpenAIOptions {
  apiKey?: string;
  extractionModel?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}
export interface Candidate {
  item: EmbeddedItem;
  bestMatch: EmbeddedItem | null;
  similarity: number | null;
  eligibleCount: number;
}
export interface Match {
  itemId: string;
  kind: ItemKind;
  elicitation: Elicitation;
  isRepeat: boolean;
  similarity: number | null;
  matchedItemId: string | null;
  matchedCallId: string | null;
  candidateItemId: string | null;
  candidateCallId: string | null;
  eligibleCount: number;
}
export interface RepeatCounts {
  total: number;
  unprompted: number;
  prompted: number;
  uncertain: number;
  stories: number;
  questions: number;
}
export interface AnalysisInput {
  call: unknown;
  history: unknown;
  processingAllowed: boolean;
}
export interface Provenance {
  detectorVersion: '1.0.0';
  extractionModel: string | null;
  promptVersion: 'remi-items-v1';
  embeddingModel: string;
  embeddingDimensions: number;
  threshold: number;
  isSimulated: boolean;
}
export type AnalysisResult = {
  status: 'ok';
  persistenceKey: string;
  elderId: string;
  callId: string;
  items: EmbeddedItem[];
  historyUpdates: EmbeddedItem[];
  matches: Match[];
  counts: RepeatCounts;
  provenance: Provenance;
} | {
  status: 'unavailable';
  elderId: string | null;
  callId: string | null;
  items: [];
  historyUpdates: [];
  matches: [];
  counts: null;
  error: { code: DetectorErrorCode; message: string };
};
