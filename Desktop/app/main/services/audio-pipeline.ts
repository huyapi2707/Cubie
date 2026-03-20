/**
 * Audio Pipeline — Main Process
 *
 * Complete audio capture and processing pipeline running in Node.js:
 *   Mic (RtAudio) → Native RNNoise (denoise) → VAD (RMS-based) → Speech segments
 *
 * Uses:
 *   - audify (RtAudio) for native mic capture at 48kHz
 *   - Native RNNoise C addon (N-API) for noise suppression
 *   - Custom RMS-based VAD with hangover + pre-roll
 *
 * RNNoise expects Float32Array frames of 480 samples (10ms @ 48kHz)
 * containing 16-bit PCM values (i.e. values in the range [-32768, 32767]).
 */

import path from 'path';
import { app } from 'electron';
import { RtAudio, RtAudioFormat } from 'audify';
import { getDefaultInputDeviceId } from './audio-service';
import type { RNNoise } from '../../../native/rnnoise/index';

// Load the native RNNoise addon (compiled from xiph/rnnoise via N-API)
// In dev:  __dirname = <project>/dist/main/main/services/ → resolve up to project root
// In prod: asar.unpacked contains the .node file alongside the asar archive
const rnnoiseNodePath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'rnnoise', 'build', 'Release', 'rnnoise.node')
  : path.join(__dirname, '..', '..', '..', '..', 'native', 'rnnoise', 'build', 'Release', 'rnnoise.node');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rnnoiseAddon = require(rnnoiseNodePath) as { RNNoise: new () => RNNoise };

// ─── Constants ──────────────────────────────────────────────────────────────

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const FRAME_SIZE = 480; // 10ms @ 48kHz (RNNoise native frame size)

// VAD thresholds
const SPEECH_THRESHOLD = 0.01;     // RMS to trigger speech start
const SILENCE_THRESHOLD = 0.005;   // RMS below this = silence during speech
const HANGOVER_FRAMES = 30;        // ~300ms silence before speech end
const PREROLL_FRAMES = 10;         // ~100ms of pre-roll

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AudioPipelineCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  /** Called for every denoised frame with its RMS level (useful for level meters). */
  onFrame?: (level: number) => void;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export class AudioPipeline {
  private rtAudio: RtAudio | null = null;
  private rnnoise: RNNoise | null = null;
  private callbacks: AudioPipelineCallbacks;
  private running = false;

  // Pre-allocated scratch buffers — zero per-frame allocations for the hot path
  private rnnoiseInput = new Float32Array(FRAME_SIZE);
  private denoised = new Float32Array(FRAME_SIZE);

  // Frame accumulation — RtAudio may deliver buffers of varying sizes
  private frameBuffer = new Float32Array(FRAME_SIZE);
  private frameIndex = 0;

  // VAD state
  private speaking = false;
  private hangover = 0;

  // Pre-roll ring buffer
  private preroll: Float32Array[] = Array.from(
    { length: PREROLL_FRAMES },
    () => new Float32Array(FRAME_SIZE),
  );
  private prerollWrite = 0;
  private prerollCount = 0;

  // Speech accumulator
  private speechFrames: Float32Array[] = [];

  constructor(callbacks: AudioPipelineCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Start capturing from the specified device and processing audio.
   * @param deviceId The RtAudio numeric device ID.
   */
  async start(deviceId: number): Promise<void> {
    if (this.running) return;

    // 1. Create native RNNoise instance (synchronous — no WASM loading overhead)
    this.rnnoise = new rnnoiseAddon.RNNoise();
    console.log(`[AudioPipeline] Native RNNoise loaded — frame size: ${this.rnnoise.getFrameSize()}`);

    // 2. Use the provided device ID (fall back to default if 0 or invalid)
    const resolvedId = deviceId > 0 ? deviceId : getDefaultInputDeviceId();
    console.log(`[AudioPipeline] Using input device id: ${resolvedId}`);

    // 3. Open RtAudio input stream
    this.rtAudio = new RtAudio();
    this.rtAudio.openStream(
      null, // No output
      { deviceId: resolvedId, nChannels: CHANNELS }, // Input
      RtAudioFormat.RTAUDIO_SINT16, // 16-bit signed int PCM
      SAMPLE_RATE,
      FRAME_SIZE,
      'CubieVoice',
      this.onAudioInput.bind(this), // Input callback
      null, // No frame output callback
    );

    this.rtAudio.start();
    this.running = true;
    console.log('[AudioPipeline] Started — 48kHz, Native RNNoise → VAD');
  }

  /**
   * Stop the pipeline and release resources.
   */
  stop(): void {
    if (!this.running) return;

    try {
      if (this.rtAudio?.isStreamRunning()) {
        this.rtAudio.stop();
      }
      if (this.rtAudio?.isStreamOpen()) {
        this.rtAudio.closeStream();
      }
    } catch (err) {
      console.warn('[AudioPipeline] Error stopping stream:', err);
    }
    this.rtAudio = null;

    if (this.rnnoise) {
      this.rnnoise.destroy();
      this.rnnoise = null;
    }

    // Reset VAD state
    this.speaking = false;
    this.hangover = 0;
    this.frameIndex = 0;
    this.speechFrames = [];
    this.prerollWrite = 0;
    this.prerollCount = 0;
    this.running = false;

    console.log('[AudioPipeline] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── Audio Processing ───────────────────────────────────────────────────

  /**
   * Called by RtAudio when new PCM data is available.
   * Receives Buffer of int16 PCM samples.
   */
  private onAudioInput(pcmBuffer: Buffer): void {
    // Convert Int16 Buffer → Float32Array (normalized -1..1)
    const sampleCount = pcmBuffer.length / 2;
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = pcmBuffer.readInt16LE(i * 2) / 32768.0;
    }

    // Accumulate into FRAME_SIZE chunks
    let offset = 0;
    while (offset < float32.length) {
      const remaining = FRAME_SIZE - this.frameIndex;
      const toCopy = Math.min(remaining, float32.length - offset);
      this.frameBuffer.set(float32.subarray(offset, offset + toCopy), this.frameIndex);
      this.frameIndex += toCopy;
      offset += toCopy;

      if (this.frameIndex === FRAME_SIZE) {
        this.processFrame(new Float32Array(this.frameBuffer));
        this.frameIndex = 0;
      }
    }
  }

  /**
   * Process a single 480-sample frame through RNNoise + VAD.
   */
  private processFrame(frame: Float32Array): void {
    // RNNoise expects 16-bit PCM values in Float32Array
    // Convert normalized float → 16-bit range (reusing scratch buffer)
    for (let i = 0; i < FRAME_SIZE; i++) {
      this.rnnoiseInput[i] = frame[i] * 32768.0;
    }

    // Apply native RNNoise — returns new Float32Array with denoised output
    if (this.rnnoise) {
      const output = this.rnnoise.process(this.rnnoiseInput);
      // Convert back to normalized float (reusing scratch buffer)
      for (let i = 0; i < FRAME_SIZE; i++) {
        this.denoised[i] = output[i] / 32768.0;
      }
    } else {
      // Fallback: pass through unprocessed (normalized)
      this.denoised.set(frame);
    }

    // RMS-based VAD
    const rms = calculateRms(this.denoised);

    // Notify per-frame listeners (level meter)
    this.callbacks.onFrame?.(rms);

    if (!this.speaking) {
      // Update pre-roll ring buffer
      this.preroll[this.prerollWrite % PREROLL_FRAMES].set(this.denoised);
      this.prerollWrite++;
      this.prerollCount = Math.min(this.prerollCount + 1, PREROLL_FRAMES);

      if (rms > SPEECH_THRESHOLD) {
        this.speaking = true;
        this.hangover = HANGOVER_FRAMES;

        // Flush pre-roll into speech buffer
        const start = this.prerollWrite - this.prerollCount;
        for (let j = start; j < this.prerollWrite; j++) {
          this.speechFrames.push(new Float32Array(this.preroll[j % PREROLL_FRAMES]));
        }
        this.speechFrames.push(new Float32Array(this.denoised));
        this.callbacks.onSpeechStart?.();
      }
    } else {
      this.speechFrames.push(new Float32Array(this.denoised));

      if (rms > SILENCE_THRESHOLD) {
        this.hangover = HANGOVER_FRAMES;
      } else {
        this.hangover--;
        if (this.hangover <= 0) {
          this.endSpeech();
        }
      }
    }
  }

  private endSpeech(): void {
    this.speaking = false;

    // Concatenate all speech frames
    const total = this.speechFrames.length * FRAME_SIZE;
    const audio = new Float32Array(total);
    for (let i = 0; i < this.speechFrames.length; i++) {
      audio.set(this.speechFrames[i], i * FRAME_SIZE);
    }

    this.callbacks.onSpeechEnd?.(audio);

    // Reset
    this.speechFrames = [];
    this.prerollWrite = 0;
    this.prerollCount = 0;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculateRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}
