
/**
 * Calculate the Root Mean Square (RMS) of a PCM sample buffer.
 *
 * @param samples - Float32Array of PCM samples
 * @returns RMS value
 */
export function calculateRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Convert an RMS value (Int16 range) to decibels relative to full-scale (dBFS).
 * 0 dBFS = 32768 (Int16 max). Silence returns -Infinity.
 */
export function rmsToDb(rms: number): number {
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms / 32768);
}

