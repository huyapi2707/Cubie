import { WorkerPool } from "../workers/worker-pool.js";
import { createChildLogger, metrics } from "../utils/index.js";
import type {
  SttResult,
  TranslateResult,
  TtsResult,
} from "../types/worker.js";

const log = createChildLogger({ module: "audio-pipeline" });

/**
 * Orchestrates the audio processing pipeline:
 *   1. Speech-to-Text (STT)
 *   2. Translation
 *   3. Text-to-Speech (TTS)
 *
 * Each stage runs as a worker thread task to avoid blocking the event loop.
 */
export class AudioPipelineService {
  constructor(private workerPool: WorkerPool) {}

  /**
   * Run speech-to-text on an audio buffer.
   */
  async speechToText(
    sessionId: string,
    audioBuffer: Buffer,
    language: string,
    sampleRate?: number
  ): Promise<SttResult | null> {
    try {
      const result = await this.workerPool.submitTask({
        type: "stt",
        sessionId,
        data: { audioBuffer, language, sampleRate },
      });

      if (!result.success) {
        log.error({ sessionId, error: result.error }, "STT task failed");
        metrics.increment("pipeline.stt_failures");
        return null;
      }

      metrics.increment("pipeline.stt_success");
      return result.data as SttResult;
    } catch (err) {
      log.error({ sessionId, err }, "STT task error");
      metrics.increment("pipeline.stt_errors");
      return null;
    }
  }

  /**
   * Translate text between languages.
   */
  async translate(
    sessionId: string,
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<TranslateResult | null> {
    // Skip translation if source == target
    if (sourceLanguage === targetLanguage) {
      return {
        text,
        sourceLanguage,
        targetLanguage,
      };
    }

    try {
      const result = await this.workerPool.submitTask({
        type: "translate",
        sessionId,
        data: { text, sourceLanguage, targetLanguage },
      });

      if (!result.success) {
        log.error(
          { sessionId, error: result.error },
          "Translation task failed"
        );
        metrics.increment("pipeline.translate_failures");
        return null;
      }

      metrics.increment("pipeline.translate_success");
      return result.data as TranslateResult;
    } catch (err) {
      log.error({ sessionId, err }, "Translation task error");
      metrics.increment("pipeline.translate_errors");
      return null;
    }
  }

  /**
   * Convert text to speech audio.
   */
  async textToSpeech(
    sessionId: string,
    text: string,
    language: string,
    gender: string = "neutral"
  ): Promise<TtsResult | null> {
    try {
      const result = await this.workerPool.submitTask({
        type: "tts",
        sessionId,
        data: { text, language, gender },
      });

      if (!result.success) {
        log.error({ sessionId, error: result.error }, "TTS task failed");
        metrics.increment("pipeline.tts_failures");
        return null;
      }

      metrics.increment("pipeline.tts_success");
      return result.data as TtsResult;
    } catch (err) {
      log.error({ sessionId, err }, "TTS task error");
      metrics.increment("pipeline.tts_errors");
      return null;
    }
  }

  /**
   * Run the full processing pipeline: STT → Translate → TTS.
   * Returns results at each stage for progressive client updates.
   */
  async processAudio(
    sessionId: string,
    audioBuffer: Buffer,
    sourceLanguage: string,
    targetLanguage: string,
    ttsGender: string = "neutral",
    sampleRate?: number
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    const pipelineResult: PipelineResult = {
      stt: null,
      translation: null,
      tts: null,
      durationMs: 0,
    };

    // Stage 1: Speech-to-Text
    const sttResult = await this.speechToText(
      sessionId,
      audioBuffer,
      sourceLanguage,
      sampleRate
    );

    if (!sttResult || !sttResult.text) {
      pipelineResult.stt = { text: "No voice detected", isFinal: true, confidence: 0 };
      pipelineResult.durationMs = Date.now() - startTime;
      return pipelineResult;
    }

    pipelineResult.stt = sttResult;

    // Stage 2: Translation
    const translateResult = await this.translate(
      sessionId,
      sttResult.text,
      sourceLanguage,
      targetLanguage
    );

    if (!translateResult) {
      pipelineResult.durationMs = Date.now() - startTime;
      return pipelineResult;
    }

    pipelineResult.translation = translateResult;

    // Stage 3: Text-to-Speech
    const ttsResult = await this.textToSpeech(
      sessionId,
      translateResult.text,
      targetLanguage,
      ttsGender
    );

    if (ttsResult) {
      pipelineResult.tts = ttsResult;
    }

    pipelineResult.durationMs = Date.now() - startTime;

    metrics.recordLatency("pipeline.full_latency", pipelineResult.durationMs);
    log.debug(
      { sessionId, durationMs: pipelineResult.durationMs },
      "Pipeline completed"
    );

    return pipelineResult;
  }
}

export interface PipelineResult {
  stt: SttResult | null;
  translation: TranslateResult | null;
  tts: TtsResult | null;
  durationMs: number;
}
