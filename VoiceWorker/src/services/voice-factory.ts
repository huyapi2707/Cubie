import { createChildLogger } from "../utils/index.js";
import type {
  SttPayload,
  SttResult,
  TranslatePayload,
  TranslateResult,
  TtsPayload,
  TtsResult,
} from "../types/worker.js";

const log = createChildLogger({ module: "voice" });

// ─── Provider Interfaces ─────────────────────────────────────────────────────

export interface STTProvider {
  readonly name: string;

  /**
   * Transcribe an audio buffer into text.
   */
  transcribe(payload: SttPayload): Promise<SttResult>;
}

export interface TTSProvider {
  readonly name: string;

  /**
   * Synthesise speech audio from text.
   */
  synthesize(payload: TtsPayload): Promise<TtsResult>;
}

export interface TranslatorProvider {
  readonly name: string;

  /**
   * Translate text between languages.
   */
  translate(payload: TranslatePayload): Promise<TranslateResult>;
}

// ─── STT Factory ─────────────────────────────────────────────────────────────

export type STTProviderName = "google" | "azure" | "whisper";

export class STTFactory {
  private static readonly providers = new Map<STTProviderName, STTProvider>();

  /**
   * Register a provider instance.
   */
  static register(name: STTProviderName, provider: STTProvider): void {
    STTFactory.providers.set(name, provider);
    log.info({ provider: name }, "STT provider registered");
  }

  /**
   * Retrieve an STT provider instance by name.
   *
   * @throws {Error} if the requested provider has not been registered.
   */
  static getProvider(name: STTProviderName): STTProvider {
    const provider = STTFactory.providers.get(name);

    if (!provider) {
      const available = Array.from(STTFactory.providers.keys()).join(", ");
      throw new Error(
        `STT provider "${name}" is not registered. Available: [${available}]`
      );
    }

    return provider;
  }
}

// ─── TTS Factory ─────────────────────────────────────────────────────────────

export type TTSProviderName = "google" | "azure" | "elevenlabs";

export class TTSFactory {
  private static readonly providers = new Map<TTSProviderName, TTSProvider>();

  /**
   * Register a provider instance.
   */
  static register(name: TTSProviderName, provider: TTSProvider): void {
    TTSFactory.providers.set(name, provider);
    log.info({ provider: name }, "TTS provider registered");
  }

  /**
   * Retrieve a TTS provider instance by name.
   *
   * @throws {Error} if the requested provider has not been registered.
   */
  static getProvider(name: TTSProviderName): TTSProvider {
    const provider = TTSFactory.providers.get(name);

    if (!provider) {
      const available = Array.from(TTSFactory.providers.keys()).join(", ");
      throw new Error(
        `TTS provider "${name}" is not registered. Available: [${available}]`
      );
    }

    return provider;
  }
}

// ─── Translator Factory ──────────────────────────────────────────────────────

export type TranslatorProviderName = "google" | "azure" | "deepl";

export class TranslatorFactory {
  private static readonly providers = new Map<TranslatorProviderName, TranslatorProvider>();

  /**
   * Register a provider instance.
   */
  static register(name: TranslatorProviderName, provider: TranslatorProvider): void {
    TranslatorFactory.providers.set(name, provider);
    log.info({ provider: name }, "Translator provider registered");
  }

  /**
   * Retrieve a Translator provider instance by name.
   *
   * @throws {Error} if the requested provider has not been registered.
   */
  static getProvider(name: TranslatorProviderName): TranslatorProvider {
    const provider = TranslatorFactory.providers.get(name);

    if (!provider) {
      const available = Array.from(TranslatorFactory.providers.keys()).join(", ");
      throw new Error(
        `Translator provider "${name}" is not registered. Available: [${available}]`
      );
    }

    return provider;
  }
}
