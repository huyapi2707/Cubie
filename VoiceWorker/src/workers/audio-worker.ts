/**
 * Worker Thread Script
 *
 * Runs inside a Node.js worker thread. Receives task messages from the
 * main thread, executes the appropriate processing handler, and posts
 * results back.
 */

import { parentPort } from "node:worker_threads";
import { STTFactory, TranslatorFactory, TTSFactory } from "../services/voice-factory.js";
import { GoogleSTTProvider } from "../services/stt/index.js";
import { GoogleTranslatorProvider } from "../services/translator/index.js";
import { GoogleTTSProvider } from "../services/tts/index.js";
import type {
  WorkerMessage,
  WorkerResponse,
  WorkerTaskResult,
  SttPayload,
  TranslatePayload,
  TtsPayload,
} from "../types/worker.js";

if (!parentPort) {
  throw new Error("This module must be run as a Worker Thread");
}

// ─── Register providers in this worker thread ────────────────────────────────
STTFactory.register("google", new GoogleSTTProvider());
TranslatorFactory.register("google", new GoogleTranslatorProvider());
TTSFactory.register("google", new GoogleTTSProvider());

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
 * Speech-to-Text via the registered STT provider.
 */
async function processStt(
  sessionId: string,
  payload: SttPayload
): Promise<Omit<WorkerTaskResult, "durationMs">> {
  const provider = STTFactory.getProvider("google");
  const sttResult = await provider.transcribe(payload);

  return {
    type: "stt",
    sessionId,
    success: true,
    data: sttResult,
  };
}

/**
 * Translation via the registered Translator provider.
 */
async function processTranslate(
  sessionId: string,
  payload: TranslatePayload
): Promise<Omit<WorkerTaskResult, "durationMs">> {
  const provider = TranslatorFactory.getProvider("google");
  const translateResult = await provider.translate(payload);

  return {
    type: "translate",
    sessionId,
    success: true,
    data: translateResult,
  };
}

async function processTts(
  sessionId: string,
  payload: TtsPayload
): Promise<Omit<WorkerTaskResult, "durationMs">> {
  try {
    const provider = TTSFactory.getProvider("google");
    const ttsResult = await provider.synthesize(payload);

    return {
      type: "tts",
      sessionId,
      success: true,
      data: ttsResult,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      type: "tts",
      sessionId,
      success: false,
      error: message,
    };
  }
}

