/**
 * Extends DOM types with the Audio Output Devices API.
 *
 * `setSinkId()` is part of the Audio Output Devices API and allows routing
 * audio output to a specific device. TypeScript's built-in DOM types do not
 * include this method because the API is not universally supported.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId
 */

interface HTMLMediaElement {
  /**
   * Sets the ID of the audio device to use for output.
   * @param sinkId - The device ID of the audio output device, or "" for the default device.
   * @returns A Promise that resolves when the audio output device has been updated.
   */
  setSinkId(sinkId: string): Promise<void>;

  /** The current audio output device ID, or "" if using the default device. */
  readonly sinkId: string;
}

interface AudioContext {
  /**
   * Sets the ID of the audio device to use for output.
   * @param sinkId - The device ID of the audio output device, or "" for the default device.
   * @returns A Promise that resolves when the audio output device has been updated.
   */
  setSinkId(sinkId: string): Promise<void>;

  /** The current audio output device ID, or "" if using the default device. */
  readonly sinkId: string;
}
