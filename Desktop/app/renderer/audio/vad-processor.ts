/**
 * VAD AudioWorklet Processor
 *
 * Runs in the AudioWorklet thread at 48kHz.
 * Receives denoised audio from the RNNoise worklet,
 * detects speech using RMS thresholding + hangover logic,
 * and sends complete speech segments to the main thread.
 *
 * Audio graph position:
 *   Mic → RNNoise Worklet → [this] VAD Processor → (main thread events)
 *
 * DSP decisions:
 *   - 480 samples = 10ms frame (matches RNNoise native frame size)
 *   - Two-threshold hysteresis: SPEECH_THRESHOLD to enter, SILENCE_THRESHOLD to exit
 *   - Hangover prevents premature cutoff on brief pauses
 *   - 100ms pre-roll captures initial phonemes that trigger detection
 */

import { calculateRms } from "@/lib/utils";

// ─── AudioWorklet types (not in default TS DOM lib) ─────────────────────────

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

// ─── Constants (inlined, no external imports in AudioWorkletGlobalScope) ─────

const FRAME_SIZE = 480;           // 10ms @ 48kHz
const SPEECH_THRESHOLD = 0.01;    // RMS to trigger speech start
const SILENCE_THRESHOLD = 0.005;  // RMS to count as silence during speech
const HANGOVER_FRAMES = 30;       // ~300ms of silence before speech end
const PREROLL_FRAMES = 10;        // ~100ms of pre-roll audio

// ─── Processor ──────────────────────────────────────────────────────────────────

class VadProcessor extends AudioWorkletProcessor {
  // Frame accumulation (128 → 480)
  private frameBuffer = new Float32Array(FRAME_SIZE);
  private frameIndex = 0;

  // VAD state
  private speaking = false;
  private hangover = 0;

  // Pre-roll ring buffer (stores recent frames when NOT speaking)
  private preroll: Float32Array[] = Array.from(
    { length: PREROLL_FRAMES },
    () => new Float32Array(FRAME_SIZE),
  );
  private prerollWrite = 0;
  private prerollCount = 0;

  // Speech segment accumulator
  private speechFrames: Float32Array[] = [];

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input) return true;

    // Pass-through for monitoring (mic tester / debug)
    if (output) output.set(input);

    // Accumulate 128-sample blocks into FRAME_SIZE (480) chunks
    let i = 0;
    while (i < input.length) {
      const remaining = FRAME_SIZE - this.frameIndex;
      const toCopy = Math.min(remaining, input.length - i);
      this.frameBuffer.set(input.subarray(i, i + toCopy), this.frameIndex);
      this.frameIndex += toCopy;
      i += toCopy;

      if (this.frameIndex === FRAME_SIZE) {
        this.processFrame(this.frameBuffer);
        this.frameIndex = 0;
      }
    }

    return true;
  }

  private processFrame(frame: Float32Array): void {
    const rms = calculateRms(frame);
    const copy = new Float32Array(frame);

    if (!this.speaking) {
      // ── Not speaking: update pre-roll ──
      this.preroll[this.prerollWrite % PREROLL_FRAMES].set(copy);
      this.prerollWrite++;
      this.prerollCount = Math.min(this.prerollCount + 1, PREROLL_FRAMES);

      if (rms > SPEECH_THRESHOLD) {
        // Speech detected → flush pre-roll into speech buffer
        this.speaking = true;
        this.hangover = HANGOVER_FRAMES;

        const start = this.prerollWrite - this.prerollCount;
        for (let j = start; j < this.prerollWrite; j++) {
          this.speechFrames.push(
            new Float32Array(this.preroll[j % PREROLL_FRAMES]),
          );
        }
        this.speechFrames.push(copy);

        this.port.postMessage({ type: 'speech-start' });
      }
    } else {
      // ── Currently speaking ──
      this.speechFrames.push(copy);

      if (rms > SILENCE_THRESHOLD) {
        // Still hearing voice → reset hangover
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

    // Concatenate all speech frames into a single Float32Array
    const total = this.speechFrames.length * FRAME_SIZE;
    const audio = new Float32Array(total);
    for (let i = 0; i < this.speechFrames.length; i++) {
      audio.set(this.speechFrames[i], i * FRAME_SIZE);
    }

    // Transfer ownership to main thread (zero-copy via Transferable)
    this.port.postMessage({ type: 'speech-end', audio }, [audio.buffer]);

    // Reset state
    this.speechFrames = [];
    this.prerollWrite = 0;
    this.prerollCount = 0;
  }

}

registerProcessor('vad-processor', VadProcessor);
