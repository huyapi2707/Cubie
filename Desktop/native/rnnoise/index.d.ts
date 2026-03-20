/**
 * Type declarations for the native RNNoise N-API addon.
 *
 * The addon is compiled from xiph/rnnoise C source and loaded via require().
 * Path: native/rnnoise/build/Release/rnnoise.node
 */

/** Native RNNoise denoiser instance. */
export class RNNoise {
  /**
   * Process a single frame of audio through RNNoise.
   *
   * @param frame Float32Array of exactly 480 samples in 16-bit PCM range [-32768, 32767]
   * @returns Float32Array of 480 denoised samples in the same range
   */
  process(frame: Float32Array): Float32Array;

  /** Free native resources. Must be called when done. */
  destroy(): void;

  /** Returns the frame size (always 480). */
  getFrameSize(): number;
}
