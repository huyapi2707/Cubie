/**
 * Resample a LINEAR16 (signed 16-bit little-endian) PCM buffer to a different
 * sample rate using linear interpolation.
 *
 * @param pcm        - Input buffer of signed 16-bit LE samples.
 * @param fromRate   - Original sample rate in Hz (e.g. 48000).
 * @param toRate     - Target sample rate in Hz (e.g. 8000, 16000).
 * @returns A new Buffer containing the resampled 16-bit LE PCM at `toRate` Hz.
 *          If `fromRate` equals `toRate` the original buffer is returned as-is.
 */
export function resampleLinear16(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) {
    return pcm;
  }

  const bytesPerSample = 2; // LINEAR16
  const srcSampleCount = pcm.length / bytesPerSample;
  const ratio = fromRate / toRate;
  const dstSampleCount = Math.floor(srcSampleCount / ratio);

  const out = Buffer.alloc(dstSampleCount * bytesPerSample);

  for (let i = 0; i < dstSampleCount; i++) {
    const srcIndex = i * ratio;
    const idx0 = Math.floor(srcIndex);
    const idx1 = Math.min(idx0 + 1, srcSampleCount - 1);
    const frac = srcIndex - idx0;

    const s0 = pcm.readInt16LE(idx0 * bytesPerSample);
    const s1 = pcm.readInt16LE(idx1 * bytesPerSample);

    // Linear interpolation, clamped to Int16 range.
    const interpolated = Math.round(s0 + frac * (s1 - s0));
    const clamped = Math.max(-32768, Math.min(32767, interpolated));

    out.writeInt16LE(clamped, i * bytesPerSample);
  }

  return out;
}
