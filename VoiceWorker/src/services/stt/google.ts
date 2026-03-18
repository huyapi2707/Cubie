import { SpeechClient } from "@google-cloud/speech";
import { createChildLogger } from "../../utils/index.js";
import type { STTProvider } from "../voice-factory.js";
import type { SttPayload, SttResult } from "../../types/worker.js";

const log = createChildLogger({ module: "stt:google" });

export class GoogleSTTProvider implements STTProvider {
  readonly name = "google";
  private readonly client: SpeechClient;

  constructor() {
    this.client = new SpeechClient();
    log.info("Google STT client initialised");
  }

  async transcribe(payload: SttPayload): Promise<SttResult> {
    const { audioBuffer, language, sampleRate } = payload;

    // audioBuffer may arrive as Uint8Array after crossing the worker thread
    // boundary, so ensure it's a proper Buffer for base64 encoding.
    const buffer = Buffer.from(audioBuffer);

    log.debug(
      { language, bytes: buffer.length, sampleRate },
      "Transcribing audio with Google STT"
    );

    const [response] = await this.client.recognize({
      audio: { content: buffer.toString("base64") },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: sampleRate ?? 16000,
        languageCode: language,
      },
    });

    const topResult = response.results?.[0]?.alternatives?.[0];

    return {
      text: topResult?.transcript ?? "",
      isFinal: true,
      confidence: topResult?.confidence ?? 0,
    };
  }
}

