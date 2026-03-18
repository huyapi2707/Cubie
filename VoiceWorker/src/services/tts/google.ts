import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { createChildLogger } from "../../utils/index.js";
import type { TTSProvider } from "../voice-factory.js";
import type { TtsPayload, TtsResult } from "../../types/worker.js";

const log = createChildLogger({ module: "tts:google" });

export class GoogleTTSProvider implements TTSProvider {
  readonly name = "google";
  private readonly client: TextToSpeechClient;

  constructor() {
    this.client = new TextToSpeechClient();
    log.info("Google TTS client initialised");
  }

  async synthesize(payload: TtsPayload): Promise<TtsResult> {
    const { text, language, voice } = payload;

    log.debug(
      { language, voice, textLength: text.length },
      "Synthesizing speech with Google TTS"
    );

    const [response] = await this.client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: language,
        name: voice ?? undefined,
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: 24000,
      },
    });

    const audioContent = response.audioContent;
    if (!audioContent) {
      throw new Error("Google TTS returned empty audio content");
    }

    // audioContent is a Uint8Array — convert to Buffer
    const audioBuffer = Buffer.from(audioContent as Uint8Array);

    log.debug(
      { language, voice, bytes: audioBuffer.length },
      "Speech synthesized successfully"
    );

    return {
      audioBuffer,
      format: "pcm",
      sampleRate: 24000,
    };
  }
}
