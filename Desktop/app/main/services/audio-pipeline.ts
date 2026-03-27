/**
 * Audio Pipeline — Main Process
 *
 * Complete audio capture and processing pipeline running in Node.js:
 *   Mic (RtAudio) → Native RNNoise (denoise) → Silero VAD (avr-vad) → Speech segments
 *
 * Uses:
 *   - audify (RtAudio) for native mic capture at 48kHz
 *   - Native RNNoise C addon (N-API) for noise suppression
 *   - avr-vad (Silero VAD v5) for neural-network-based voice activity detection
 *
 * RNNoise expects Float32Array frames of 480 samples (10ms @ 48kHz)
 * containing Int16-scale float values (i.e. [-32768, 32767]).
 * SINT16 input is read directly into this range — no scaling needed.
 *
 * avr-vad expects normalized Float32 [-1.0, 1.0] and handles resampling
 * from 48kHz → 16kHz internally. It manages pre-roll, hangover
 * (redemption frames), and speech accumulation.
 */

import path from 'path';
import { app } from 'electron';
import { type RtAudio } from 'audify';
import { RealTimeVAD } from 'avr-vad';
import { getDefaultInputDeviceId, createRtAudio } from './audio-service';
import { SAMPLE_RATE, FRAME_SIZE, AUDIO_FORMAT, MIC_CHANNELS } from './constants';
import { getSetting } from './settings-store';
import type { RNNoise } from '../../../native/rnnoise/index';
import { calculateRms, rmsToDb, normalizeInt16, denormalizeInt16 } from './utils';


// Load the native RNNoise addon (compiled from xiph/rnnoise via N-API)
// In dev:  __dirname = <project>/dist/main/main/services/ → resolve up to project root
// In prod: asar.unpacked contains the .node file alongside the asar archive
const rnnoiseNodePath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'rnnoise', 'build', 'Release', 'rnnoise.node')
  : path.join(__dirname, '..', '..', '..', '..', 'native', 'rnnoise', 'build', 'Release', 'rnnoise.node');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rnnoiseAddon = require(rnnoiseNodePath) as { RNNoise: new () => RNNoise };

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AudioPipelineCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  /** Called for every denoised frame with its RMS level (useful for level meters). */
  onFrame?: (level: number) => void;
  /** Called for every denoised frame with the raw audio data (useful for speaker output). */
  onDenoisedFrame?: (frame: Float32Array) => void;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export class AudioPipeline {
  private rtAudio: RtAudio | null = null;
  private rnnoise: RNNoise | null = null;
  private vad: RealTimeVAD | null = null;
  private callbacks: AudioPipelineCallbacks;
  private running = false;

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

    // 2. Initialize Silero VAD via avr-vad
    //    - sampleRate: 48kHz (avr-vad resamples to 16kHz internally)
    //    - redemptionFrames: grace period before speech-end (~8 × 96ms ≈ 768ms hangover)
    //    - preSpeechPadFrames: pre-roll frames prepended to speech segment
    this.vad = await RealTimeVAD.new({
      model: 'v5',
      sampleRate: SAMPLE_RATE,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionFrames: 8,
      preSpeechPadFrames: 1,
      minSpeechFrames: 3,
      onSpeechStart: () => {
        console.log('[AudioPipeline] Silero VAD — Speech started');
        this.callbacks.onSpeechStart?.();
      },
      onSpeechEnd: (audio: Float32Array) => {
        console.log(`[AudioPipeline] Silero VAD — Speech ended (${audio.length} samples)`);
        // avr-vad delivers normalized [-1, 1] audio at 16kHz.
        // Denormalize back to Int16 range for downstream consumers.
        this.callbacks.onSpeechEnd?.(denormalizeInt16(audio));
      },
      onFrameProcessed: (probs, _frame) => {
      },
      onSpeechRealStart: () => {
        // Fired after minSpeechFrames confirms it's real speech (not a misfire)
      },
      onVADMisfire: () => {
        console.log('[AudioPipeline] Silero VAD — Misfire (too short, discarded)');
      },
    });
    this.vad.start();
    console.log('[AudioPipeline] Silero VAD initialized (v5, 48kHz → 16kHz)');

    // 3. Use the provided device ID (fall back to default if 0 or invalid)
    const resolvedId = deviceId > 0 ? deviceId : getDefaultInputDeviceId();
    console.log(`[AudioPipeline] Using input device id: ${resolvedId}`);

    // 4. Open RtAudio input stream
    this.rtAudio = createRtAudio();
    this.rtAudio.openStream(
      null, // No output
      { deviceId: resolvedId, nChannels: MIC_CHANNELS },
      AUDIO_FORMAT,
      SAMPLE_RATE,
      FRAME_SIZE,
      'main',
      this.onAudioInput.bind(this), // Input callback
      null, // No frame output callback
    );

    this.rtAudio.start();
    this.running = true;

    console.log('[AudioPipeline] Started — 48kHz, Native RNNoise → Silero VAD');
  }

  /**
   * Stop the pipeline and release resources.
   */
  async stop(): Promise<void> {
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

    // Flush any pending speech segment and destroy VAD
    if (this.vad) {
      await this.vad.flush();
      this.vad.destroy();
      this.vad = null;
    }

    this.running = false;

    console.log('[AudioPipeline] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── Audio Processing ───────────────────────────────────────────────────

  /**
   * Called by RtAudio when new PCM data is available.
   * With RTAUDIO_SINT16, receives Buffer of 16-bit signed integers.
   */
  private onAudioInput(pcmBuffer: Buffer): void {
    // SINT16: 2 bytes per sample — convert to Float32 in Int16 range
    const sampleCount = pcmBuffer.length / 2;
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = pcmBuffer.readInt16LE(i * 2);
    }
    this.processFrame(float32);
  }

  /**
   * Process a single 480-sample frame through RNNoise + Silero VAD.
   * Input frame contains Int16-range float values [-32768, 32767].
   */
  private processFrame(frame: Float32Array): void {

    const rawRms = calculateRms(frame);
    const rawDb = rmsToDb(rawRms);
    const gateDb = getSetting('noiseGateDb');

    // Hard noise gate — skip extremely quiet frames
    if (rawDb < gateDb) {
      this.callbacks.onFrame?.(0);
      return;
    }

    let processedFrame = this.boostUp(frame);

    processedFrame = this.rnnoise?.process(processedFrame) || processedFrame;

    const processedRms = calculateRms(processedFrame);

    this.callbacks.onDenoisedFrame?.(processedFrame);
    this.callbacks.onFrame?.(processedRms);

    if ((this.callbacks.onSpeechStart || this.callbacks.onSpeechEnd) || true) {
      // Normalize Int16-range → [-1.0, 1.0] for Silero VAD
      const normalized = normalizeInt16(processedFrame);
      // Feed to Silero VAD (async but we fire-and-forget from the audio callback)
      this.vad?.processAudio(normalized).catch((err) => {
        console.error('[AudioPipeline] VAD processAudio error:', err);
      });
    }

  }

  private boostUp(frame: Float32Array): Float32Array {
    const rate = getSetting('boostUpRate');
    if (rate <= 1) return frame;

    const boostedFrame = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      boostedFrame[i] = frame[i] * rate;
    }
    return boostedFrame;
  }
}



