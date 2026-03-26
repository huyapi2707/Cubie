
/**
 * Calculate the Root Mean Square (RMS) of a PCM sample buffer.
 * Returns a normalized value in [0, 1] range regardless of whether
 * the input is in Int16 range [-32768, 32767] or normalized [-1, 1].
 *
 * @param samples - Float32Array of PCM samples (Int16-range)
 * @returns Normalized RMS value [0, 1]  (1.0 = digital full-scale)
 */
export function calculateRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const n = samples[i] / 32768;
    sumSquares += n * n;
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Convert a normalized RMS value [0, 1] to decibels relative to full-scale (dBFS).
 * 0 dBFS = 1.0 (full-scale). Silence returns -Infinity.
 */
export function rmsToDb(rms: number): number {
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms);
}

/**
 * Normalize Int16-range Float32 values [-32768, 32767] to [-1.0, 1.0].
 */
export function normalizeInt16(samples: Float32Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] / 32768;
  }
  return out;
}

/**
 * Denormalize [-1.0, 1.0] Float32 values back to Int16-range [-32768, 32767].
 * Values are clamped to prevent overflow.
 */
export function denormalizeInt16(samples: Float32Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
  }
  return out;
}
