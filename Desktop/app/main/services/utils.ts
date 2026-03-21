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
