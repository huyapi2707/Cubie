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
 * containing Int16-scale float values (i.e. [-32768, 32767]).
 * SINT16 input is read directly into this range — no scaling needed.
 */

import path from 'path';
import { app } from 'electron';
import { type RtAudio } from 'audify';
import { getDefaultInputDeviceId, createRtAudio } from './audio-service';
import { SAMPLE_RATE, FRAME_SIZE, AUDIO_FORMAT, MIC_CHANNELS } from './constants';
import { getSetting } from './settings-store';
import type { RNNoise } from '../../../native/rnnoise/index';
import { calculateRms, rmsToDb } from './utils';


// Load the native RNNoise addon (compiled from xiph/rnnoise via N-API)
// In dev:  __dirname = <project>/dist/main/main/services/ → resolve up to project root
// In prod: asar.unpacked contains the .node file alongside the asar archive
const rnnoiseNodePath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'rnnoise', 'build', 'Release', 'rnnoise.node')
  : path.join(__dirname, '..', '..', '..', '..', 'native', 'rnnoise', 'build', 'Release', 'rnnoise.node');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const rnnoiseAddon = require(rnnoiseNodePath) as { RNNoise: new () => RNNoise };

// VAD thresholds (dBFS — decibels relative to Int16 full-scale)

const HANGOVER_FRAMES = 30;        // ~300ms silence before speech end
const PREROLL_FRAMES = 10;         // ~100ms of pre-roll

// Software gain is now handled by AGC (see agc.ts) — no static multiplier

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
  private callbacks: AudioPipelineCallbacks;
  private running = false;


  private currentNoiseFloor = 0;
  private snrMargin = 0;
  private noiseFloorAdjustRate = 0;
  private dynamicVoiceThreshold = 0;

  private boostUpTarget = 0;

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

    this.currentNoiseFloor = getSetting('noiseGateDb');
    this.snrMargin = 12;
    this.noiseFloorAdjustRate = 0.05;
    this.dynamicVoiceThreshold = this.currentNoiseFloor + this.snrMargin;

    this.boostUpTarget = -18

    // 1. Create native RNNoise instance (synchronous — no WASM loading overhead)
    this.rnnoise = new rnnoiseAddon.RNNoise();
    console.log(`[AudioPipeline] Native RNNoise loaded — frame size: ${this.rnnoise.getFrameSize()}`);

    // 2. Use the provided device ID (fall back to default if 0 or invalid)
    const resolvedId = deviceId > 0 ? deviceId : getDefaultInputDeviceId();
    console.log(`[AudioPipeline] Using input device id: ${resolvedId}`);

    // 3. Open RtAudio input stream (stereo capture)
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
   * Process a single 480-sample frame through RNNoise + VAD.
   * Input frame contains Int16-range float values [-32768, 32767].
   */
  private processFrame(frame: Float32Array): void {

    const rawRms = calculateRms(frame);
    const rawDb = rmsToDb(rawRms);
    const gateDb = getSetting('noiseGateDb');

    if (rawDb < gateDb) {
      this.callbacks.onFrame?.(0);
      return;
    }

    let processedFrame = this.boostUp(frame);

    if (this.rnnoise){
      processedFrame = this.rnnoise.process(processedFrame);
    }
    
    const processedRms = calculateRms(processedFrame);
    const processedDb = rmsToDb(processedRms);

    this.autoAdjustThresholds(processedDb); 

    this.callbacks.onDenoisedFrame?.(processedFrame);

    this.callbacks.onFrame?.(processedRms);

    if (!this.speaking) {
      // Update pre-roll ring buffer
      this.preroll[this.prerollWrite % PREROLL_FRAMES].set(processedFrame);
      this.prerollWrite++;
      this.prerollCount = Math.min(this.prerollCount + 1, PREROLL_FRAMES);

      if (processedDb > this.dynamicVoiceThreshold) {
        this.speaking = true;
        this.hangover = HANGOVER_FRAMES;

        // Flush pre-roll into speech buffer
        const start = this.prerollWrite - this.prerollCount;
        for (let j = start; j < this.prerollWrite; j++) {
          this.speechFrames.push(new Float32Array(this.preroll[j % PREROLL_FRAMES]));
        }
        this.speechFrames.push(new Float32Array(processedFrame));
        this.callbacks.onSpeechStart?.();
      }
    } else {
      this.speechFrames.push(new Float32Array(processedFrame));

      if (processedDb > this.dynamicVoiceThreshold) {
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

  private autoAdjustThresholds(dbfs: number): void {

    if (!isFinite(dbfs)) return;

    if (dbfs < this.currentNoiseFloor) {
      this.currentNoiseFloor -= this.noiseFloorAdjustRate;
    } else {
      if (dbfs > this.currentNoiseFloor + this.snrMargin) {
       this.dynamicVoiceThreshold = this.currentNoiseFloor + this.snrMargin;
      }
      else {
        this.currentNoiseFloor += this.noiseFloorAdjustRate;
        this.dynamicVoiceThreshold = this.currentNoiseFloor + this.snrMargin; 
      }
    }
  }

  private boostUp(frame: Float32Array): Float32Array {
    const rms = calculateRms(frame);
    const db = rmsToDb(rms);

    if (!isFinite(db)) return new Float32Array(frame);

    const gain = Math.pow(10, (this.boostUpTarget - db) / 20);
    const boostedFrame = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      boostedFrame[i] = frame[i] * gain;
    }
    return boostedFrame;
  }
}


