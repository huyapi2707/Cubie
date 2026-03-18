import { TranslationServiceClient } from "@google-cloud/translate";
import { createChildLogger } from "../../utils/index.js";
import type { TranslatorProvider } from "../voice-factory.js";
import type { TranslatePayload, TranslateResult } from "../../types/worker.js";

const log = createChildLogger({ module: "translator:google" });

export class GoogleTranslatorProvider implements TranslatorProvider {
  readonly name = "google";
  private readonly client: TranslationServiceClient;
  private readonly parent: string;

  constructor() {
    const projectId = process.env.GOOGLE_PROJECT_ID;
    const projectLocation = "global";

    if (!projectId) {
      throw new Error("GOOGLE_PROJECT_ID environment variable is required for Google Translator");
    }

    this.client = new TranslationServiceClient();
    this.parent = `projects/${projectId}/locations/${projectLocation}`;
    log.info({ projectId }, "Google Translator client initialised");
  }

  async translate(payload: TranslatePayload): Promise<TranslateResult> {
    const { text, sourceLanguage, targetLanguage } = payload;

    log.debug(
      { sourceLanguage, targetLanguage, textLength: text.length },
      "Translating text with Google Translate"
    );

    const [response] = await this.client.translateText({
      parent: this.parent,
      contents: [text],
      sourceLanguageCode: sourceLanguage,
      targetLanguageCode: targetLanguage,
    });

    const translatedText = response.translations?.[0]?.translatedText ?? "";

    return {
      text: translatedText,
      sourceLanguage,
      targetLanguage,
    };
  }
}

