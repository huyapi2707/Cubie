declare module '@ricky0123/vad-web' {
  export interface MicVADOptions {
    startOnLoad?: boolean;
    baseAssetPath?: string;
    onnxWASMBasePath?: string;
    model?: 'v5' | 'legacy';
    ortConfig?: (ort: unknown) => void;
    workletOptions?: AudioWorkletNodeOptions;
    positiveSpeechThreshold?: number;
    negativeSpeechThreshold?: number;
    redemptionMs?: number;
    preSpeechPadMs?: number;
    minSpeechMs?: number;
    submitUserSpeechOnPause?: boolean;
    getStream?: () => Promise<MediaStream>;
    pauseStream?: (stream: MediaStream) => Promise<void>;
    resumeStream?: (stream: MediaStream) => Promise<MediaStream>;
    onSpeechStart?: () => void;
    onSpeechEnd?: (audio: Float32Array) => void;
    onSpeechRealStart?: () => void;
    onVADMisfire?: () => void;
    onFrameProcessed?: (
      probabilities: { isSpeech: number; notSpeech: number },
      frame: Float32Array,
    ) => void;
    processorType?: 'AudioWorklet' | 'ScriptProcessor' | 'auto';
  }

  export class MicVAD {
    listening: boolean;
    static new(options?: Partial<MicVADOptions>): Promise<MicVAD>;
    start(): void;
    pause(): void;
    destroy(): void;
  }
}
