import { RtAudio, RtAudioApi } from 'audify';

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
 * Create a new RtAudio instance with the platform-appropriate API.
 *
 * On Windows, `UNSPECIFIED` can auto-select ASIO when ASIO drivers are
 * installed (e.g. VB-Audio, Realtek ASIO).  ASIO only exposes devices
 * with their own ASIO drivers, hiding consumer audio endpoints.
 * Forcing WASAPI avoids this and enumerates all active Windows devices.
 *
 * macOS and Linux don't have this problem — CoreAudio / PulseAudio are
 * always the right default — so we leave them as UNSPECIFIED.
 */
export function createRtAudio(): RtAudio {
  const api = process.platform === 'win32'
    ? RtAudioApi.WINDOWS_WASAPI
    : RtAudioApi.UNSPECIFIED;
  return new RtAudio(api);
}
