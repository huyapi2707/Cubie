/**
 * Voice Pipeline
 *
 * Production-grade 48kHz voice processing pipeline.
 * Entire path runs at native sample rate with no downsampling.
 *
 * Audio graph:
 *   Mic (48kHz mono) → RNNoise Worklet → VAD Worklet → Main Thread
 *                                                        ↓
 *                                              onSpeechStart / onSpeechEnd
 *
 * Components:
 *   - RNNoise (AudioWorklet)   — real-time noise suppression via WASM
 *   - VAD    (AudioWorklet)    — RMS-based speech detection with hangover + pre-roll
 *   - Main thread              — receives clean speech segments for encoding/streaming
 */

import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm';
import NoiseSuppressorWorkletUrl from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url';
import VadProcessorUrl from '../audio/vad-processor?worker&url';
import { SOURCE_SAMPLE_RATE } from '@/constants/audio';
import { deviceService } from './device-service';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface VoicePipelineCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────────

export class VoicePipeline {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rnnoiseNode: AudioWorkletNode | null = null;
  private vadNode: AudioWorkletNode | null = null;
  private callbacks: VoicePipelineCallbacks;

  constructor(callbacks: VoicePipelineCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Start the full pipeline: mic capture → RNNoise → VAD → events.
   */
  async start(deviceId: string): Promise<void> {
    // 1. Create AudioContext at 48kHz
    this.ctx = new AudioContext({ sampleRate: SOURCE_SAMPLE_RATE });

    // 2. Load both worklet modules in parallel
    await Promise.all([
      this.ctx.audioWorklet.addModule(NoiseSuppressorWorkletUrl),
      this.ctx.audioWorklet.addModule(VadProcessorUrl),
    ]);

    // 3. Capture mic at 48kHz, mono
    //    noiseSuppression: false — we handle it with RNNoise
    this.stream = await deviceService.captureMic(deviceId, {
      channelCount: 1,
      sampleRate: SOURCE_SAMPLE_RATE,
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
    });

    // 4. Build audio graph: source → rnnoise → vad
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.rnnoiseNode = new AudioWorkletNode(this.ctx, NoiseSuppressorWorklet_Name);
    this.vadNode = new AudioWorkletNode(this.ctx, 'vad-processor');

    this.source.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(this.vadNode);
    // NOTE: No connection to ctx.destination — we don't play back mic audio

    // 5. Listen for VAD events from the worklet thread
    this.vadNode.port.onmessage = (event: MessageEvent) => {
      const { type, audio } = event.data;
      switch (type) {
        case 'speech-start':
          this.callbacks.onSpeechStart?.();
          break;
        case 'speech-end':
          this.callbacks.onSpeechEnd?.(audio as Float32Array);
          break;
      }
    };

    console.log('[VoicePipeline] Started — 48kHz, RNNoise → VAD');
  }

  /**
   * Tear down the entire pipeline. Safe to call multiple times.
   */
  stop(): void {
    this.vadNode?.disconnect();
    this.vadNode?.port.close();
    this.rnnoiseNode?.disconnect();
    this.rnnoiseNode?.port.close();
    this.source?.disconnect();

    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();

    this.vadNode = null;
    this.rnnoiseNode = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;

    console.log('[VoicePipeline] Stopped');
  }
}
