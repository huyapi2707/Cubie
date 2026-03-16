/**
 * Worker Thread Script
 *
 * Runs inside a Node.js worker thread. Receives task messages from the
 * main thread, executes the appropriate processing handler, and posts
 * results back.
 *
 * In a production deployment, the stub handlers here would be replaced
 * with real SDK calls to STT, translation, and TTS services.
 */

import { parentPort } from "node:worker_threads";
import type {
  WorkerMessage,
  WorkerResponse,
  WorkerTaskResult,
  SttPayload,
  SttResult,
  TranslatePayload,
  TranslateResult,
  TtsPayload,
  TtsResult,
} from "../types/worker.js";

if (!parentPort) {
  throw new Error("This module must be run as a Worker Thread");
}

const port = parentPort;

port.on("message", async (message: WorkerMessage) => {
  const startTime = Date.now();

  try {
    const result = await processTask(message);
    const response: WorkerResponse = {
      id: message.id,
      result: {
        ...result,
        durationMs: Date.now() - startTime,
      },
    };

    port.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      id: message.id,
      result: {
        type: message.payload.type,
        sessionId: message.payload.sessionId,
        success: false,
        error: err instanceof Error ? err.message : "Unknown worker error",
        durationMs: Date.now() - startTime,
      },
    };

    port.postMessage(response);
  }
});

// ─── Task Processors ─────────────────────────────────────────────────────────

async function processTask(
  message: WorkerMessage
): Promise<Omit<WorkerTaskResult, "durationMs">> {
  const { type, sessionId, data } = message.payload;

  switch (type) {
    case "stt":
      return processStt(sessionId, data as SttPayload);
    case "translate":
      return processTranslate(sessionId, data as TranslatePayload);
    case "tts":
      return processTts(sessionId, data as TtsPayload);
    default:
      return {
        type,
        sessionId,
        success: false,
        error: `Unknown task type: ${type}`,
      };
  }
}

/**
 * Speech-to-Text processing stub.
 *
 * Replace with actual STT SDK integration (e.g. Google Cloud Speech,
 * Azure Cognitive Services, Whisper API).
 */
async function processStt(
  sessionId: string,
  payload: SttPayload
): Promise<Omit<WorkerTaskResult, "durationMs">> {
  // Simulate processing time
  await sleep(50 + Math.random() * 100);

  const sttResult: SttResult = {
    text: `[STT result for ${payload.audioBuffer.length} bytes in ${payload.language}]`,
    isFinal: true,
    confidence: 0.95,
  };

  return {
    type: "stt",
    sessionId,
    success: true,
    data: sttResult,
  };
}

/**
 * Translation processing stub.
 *
 * Replace with actual translation API (e.g. Google Translate,
 * DeepL, Azure Translator).
 */
async function processTranslate(
  sessionId: string,
  payload: TranslatePayload
): Promise<Omit<WorkerTaskResult, "durationMs">> {
  await sleep(30 + Math.random() * 70);

  const translateResult: TranslateResult = {
    text: `[Translated: "${payload.text}" from ${payload.sourceLanguage} to ${payload.targetLanguage}]`,
    sourceLanguage: payload.sourceLanguage,
    targetLanguage: payload.targetLanguage,
  };

  return {
    type: "translate",
    sessionId,
    success: true,
    data: translateResult,
  };
}

/**
 * Text-to-Speech processing stub.
 *
 * Replace with actual TTS SDK (e.g. Google Cloud TTS,
 * Azure Cognitive Services, ElevenLabs).
 */
async function processTts(
  sessionId: string,
  _payload: TtsPayload
): Promise<Omit<WorkerTaskResult, "durationMs">> {
  await sleep(60 + Math.random() * 120);

  // Generate a small synthetic audio buffer as placeholder
  const sampleAudio = Buffer.alloc(4800, 128); // ~100ms of 8-bit 48kHz mono

  const ttsResult: TtsResult = {
    audioBuffer: sampleAudio,
    format: "pcm",
    sampleRate: 48000,
  };

  return {
    type: "tts",
    sessionId,
    success: true,
    data: ttsResult,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
