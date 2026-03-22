/**
 * Software Automatic Gain Control (AGC).
 *
 * Applies per-frame adaptive gain to bring the signal level to a target dBFS.
 * Runs BEFORE RNNoise so the denoiser receives consistently-leveled input.
 *
 * Algorithm:
 *   1. Measure frame level (dBFS) — provided by caller
 *   2. Compute desired gain: 10^((TARGET - level) / 20)
 *   3. Smooth gain via first-order IIR (slow attack, fast release)
 *   4. Gate: if below noise floor, hold current gain (don't amplify silence)
 *   5. Apply gain + hard-clip to Int16 range
 */

// ─── Tuning Constants ───────────────────────────────────────────────────────

/** Target output level — comfortable speech for RNNoise + VAD. */
const TARGET_DB = -26;

/** Never attenuate below unity gain. */
const MIN_GAIN = 1.0;

/** Maximum amplification (~20 dB boost). Prevents extreme noise amplification. */
const MAX_GAIN = 10.0;

/** Slow attack — gain increases gradually (~2s to converge).
 *  Prevents audible "pumping" when transitioning from silence to speech. */
const ATTACK_COEFF = 0.005;

/** Fast release — gain drops quickly (~200ms to converge).
 *  Prevents clipping on sudden loud sounds. */
const RELEASE_COEFF = 0.05;

// ─── AGC Class ──────────────────────────────────────────────────────────────

export class AGC {
  private smoothGain = 1.0;

  /**
   * Process a frame **in-place**.
   *
   * @param frame   480-sample Float32Array in Int16 range [-32768, 32767]
   * @param rmsDb   Pre-computed dBFS of the frame (from calculateRms → rmsToDb)
   * @param gateDb  Noise gate threshold — frames below this hold current gain
   */
  process(frame: Float32Array, rmsDb: number, gateDb: number): void {
    // Gate: only update gain when signal is above the noise floor.
    // During silence we keep applying the last computed gain so that
    // the transition from silence → speech is smooth.
    if (rmsDb > gateDb && isFinite(rmsDb)) {
      // Desired gain to reach target level
      const errorDb = TARGET_DB - rmsDb;
      const desiredGain = Math.pow(10, errorDb / 20);
      const clampedGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, desiredGain));

      // Exponential smoothing: slow attack (up), fast release (down)
      const coeff = clampedGain > this.smoothGain ? ATTACK_COEFF : RELEASE_COEFF;
      this.smoothGain += coeff * (clampedGain - this.smoothGain);
    }

    // Apply gain + hard clip to Int16 range
    const g = this.smoothGain;
    for (let i = 0; i < frame.length; i++) {
      frame[i] = Math.max(-32768, Math.min(32767, frame[i] * g));
    }
  }

  /** Reset gain to unity (call on pipeline start/stop). */
  reset(): void {
    this.smoothGain = 1.0;
  }

  /** Current smoothed gain value (useful for debugging/logging). */
  getGain(): number {
    return this.smoothGain;
  }
}
