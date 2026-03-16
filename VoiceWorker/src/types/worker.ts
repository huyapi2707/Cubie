/** Types of tasks the worker pool can process */
export type WorkerTaskType = "stt" | "translate" | "tts";

/** Input payload for a worker task */
export interface WorkerTaskPayload {
  type: WorkerTaskType;
  sessionId: string;
  data: SttPayload | TranslatePayload | TtsPayload;
}

export interface SttPayload {
  audioBuffer: Buffer;
  language: string;
  sampleRate?: number;
}

export interface TranslatePayload {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TtsPayload {
  text: string;
  language: string;
  voice?: string;
}

/** Result returned from a worker task */
export interface WorkerTaskResult {
  type: WorkerTaskType;
  sessionId: string;
  success: boolean;
  data?: SttResult | TranslateResult | TtsResult;
  error?: string;
  durationMs: number;
}

export interface SttResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export interface TranslateResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface TtsResult {
  audioBuffer: Buffer;
  format: string;
  sampleRate: number;
}

/** Internal message passed to/from worker threads */
export interface WorkerMessage {
  id: string;
  payload: WorkerTaskPayload;
}

export interface WorkerResponse {
  id: string;
  result: WorkerTaskResult;
}
