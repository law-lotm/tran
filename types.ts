
export interface TranslationHistoryItem {
  id: string;
  original: string;
  translated: string;
  timestamp: number;
  context?: string;
}

export interface FewShotExample {
  id: string;
  original: string;
  translated: string;
}

export interface TranslationContext {
  movieTitle: string;
  speaker: string;
  listener: string;
  sceneDescription: string;
  tone: 'Auto' | 'Casual' | 'Formal' | 'Aggressive' | 'Intimate' | 'Rough';
  glossary: string;
  fewShotExamples: FewShotExample[]; // New: Active Training Memory
}

export type ModelType = 'auto' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-3.1-pro-preview' | 'gemini-flash-lite-latest';

export enum ProcessingStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type BatchMode = 'text' | 'file';

export interface BatchProgress {
  totalLines: number;
  processedLines: number;
  currentBatch: number;
  totalBatches: number;
  isPaused: boolean;
}

export interface APIMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitCount: number;
  lastLatencyMs: number;
  avgLatencyMs: number;
  lastError: string | null;
  status: 'IDLE' | 'HEALTHY' | 'DEGRADED' | 'DOWN';
  lastCheckTimestamp: number;
  totalTokensUsed: number;
  reservoirTokens: number; // New: persisted reservoir
  isCircuitOpen: boolean; // New: circuit breaker status
}

export interface TokenReservoir {
  capacity: number;
  remaining: number;
  lastRefill: number;
  totalConsumed: number;
}
