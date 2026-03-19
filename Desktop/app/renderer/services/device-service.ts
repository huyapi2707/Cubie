/**
 * Device Service
 *
 * Centralises all microphone & speaker interactions:
 *   - Device enumeration (with permission request)
 *   - Mic capture (getUserMedia)
 *   - Speaker routing (setSinkId on HTMLAudioElement & AudioContext)
 *   - Resolving an audioinput device to its matching audiooutput (groupId)
 *   - Playing PCM audio through a target device
 *   - Device-existence validation
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface ListenSession {
  audio: HTMLAudioElement;
  stream: MediaStream;
  stop: () => void;
}

// ─── Service ────────────────────────────────────────────────────────────────────

class DeviceService {

  // ── Enumeration ─────────────────────────────────────────────────────

  /**
   * Request microphone permission (needed to get device labels),
   * then enumerate all audio input & output devices.
   */
  async enumerate(): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[] }> {
    // Request permission first so we get device labels (not just IDs)
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach((t) => t.stop());

    const allDevices = await navigator.mediaDevices.enumerateDevices();

    const inputs: AudioDevice[] = allDevices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`,
        groupId: d.groupId,
      }));

    const outputs: AudioDevice[] = allDevices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Speaker (${d.deviceId.slice(0, 8)}…)`,
        groupId: d.groupId,
      }));

    return { inputs, outputs };
  }

  // ── Validation ──────────────────────────────────────────────────────

  /**
   * Check whether a device ID still exists on the system.
   * @param deviceId - The device ID to check.
   * @param kind     - 'audioinput' or 'audiooutput'.
   */
  async deviceExists(deviceId: string, kind: MediaDeviceKind): Promise<boolean> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === kind && d.deviceId === deviceId);
  }

  // ── Microphone ──────────────────────────────────────────────────────

  /**
   * Capture a raw audio stream from a specific microphone.
   * The caller is responsible for stopping the returned stream.
   */
  async captureMic(
    deviceId: string,
    options?: {
      channelCount?: number;
      sampleRate?: number;
      echoCancellation?: boolean;
      noiseSuppression?: boolean;
      autoGainControl?: boolean;
    },
  ): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        ...(options?.channelCount != null && { channelCount: options.channelCount }),
        ...(options?.sampleRate != null && { sampleRate: options.sampleRate }),
        echoCancellation: options?.echoCancellation ?? false,
        noiseSuppression: options?.noiseSuppression ?? false,
        autoGainControl: options?.autoGainControl ?? false,
      },
    });
  }

  // ── Speaker routing ─────────────────────────────────────────────────

  /**
   * Resolve the matching **audiooutput** device for a given **audioinput**
   * device by comparing `groupId` (same physical / virtual cable adapter).
   *
   * Returns `null` if no matching output is found.
   */
  async resolveOutputForInput(inputDeviceId: string): Promise<AudioDevice | null> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputDev = devices.find(
      (d) => d.kind === 'audioinput' && d.deviceId === inputDeviceId,
    );
    if (!inputDev) return null;

    const outputDev = devices.find(
      (d) => d.kind === 'audiooutput' && d.groupId === inputDev.groupId,
    );
    if (!outputDev) return null;

    return {
      deviceId: outputDev.deviceId,
      label: outputDev.label || `Speaker (${outputDev.deviceId.slice(0, 8)}…)`,
      groupId: outputDev.groupId,
    };
  }

  /**
   * Route an `HTMLAudioElement` to a specific speaker device.
   * Handles the `"default"` → `""` mapping required by `setSinkId`.
   */
  async routeAudioElementToSpeaker(
    audio: HTMLAudioElement,
    speakerDeviceId: string,
  ): Promise<void> {
    if (typeof audio.setSinkId !== 'function') return;
    const sinkId = speakerDeviceId === 'default' ? '' : speakerDeviceId;
    await audio.setSinkId(sinkId);
  }

  /**
   * Route an `AudioContext` to a specific speaker device.
   * Handles the `"default"` → `""` mapping required by `setSinkId`.
   */
  async routeContextToSpeaker(
    ctx: AudioContext,
    speakerDeviceId: string,
  ): Promise<void> {
    if (typeof ctx.setSinkId !== 'function') return;
    const sinkId = speakerDeviceId === 'default' ? '' : speakerDeviceId;
    await ctx.setSinkId(sinkId);
  }

  // ── Composite operations ────────────────────────────────────────────

  /**
   * Stream audio from a mic (input device) to a speaker (output device).
   * Returns a `ListenSession` with a `stop()` callback to tear down.
   */
  async listenToMic(micDeviceId: string, speakerDeviceId: string): Promise<ListenSession> {
    const stream = await this.captureMic(micDeviceId);
    const audio = new Audio();
    audio.srcObject = stream;

    await this.routeAudioElementToSpeaker(audio, speakerDeviceId);
    await audio.play();

    const stop = () => {
      audio.pause();
      audio.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
    };

    return { audio, stream, stop };
  }

  /**
   * Play a Float32Array PCM buffer through a specific output device.
   * Resolves the matching audiooutput for an audioinput (virtual cable)
   * when `outputMicId` is provided, otherwise uses `speakerDeviceId`.
   *
   * The AudioContext is automatically closed when playback ends.
   */
  async playPcm(
    pcm: Float32Array,
    sampleRate: number,
    target: { outputMicId?: string; speakerDeviceId?: string },
  ): Promise<void> {
    const ctx = new AudioContext({ sampleRate });

    try {
      if (target.outputMicId) {
        // Resolve the matching audiooutput for the given audioinput
        const outputDev = await this.resolveOutputForInput(target.outputMicId);
        if (outputDev) {
          await this.routeContextToSpeaker(ctx, outputDev.deviceId);
        } else {
          console.warn('[DeviceService] No matching audiooutput for input:', target.outputMicId);
        }
      } else if (target.speakerDeviceId) {
        await this.routeContextToSpeaker(ctx, target.speakerDeviceId);
      }
    } catch (err) {
      console.warn('[DeviceService] Failed to route playback:', err);
    }

    const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
    buffer.getChannelData(0).set(pcm);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => ctx.close();
    source.start();
  }
}

/** Singleton instance */
export const deviceService = new DeviceService();
