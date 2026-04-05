import { RtAudio, RtAudioApi } from 'audify';
import { AudioPipeline } from './audio-pipeline';
import { SAMPLE_RATE, FRAME_SIZE, AUDIO_FORMAT, MIC_CHANNELS } from './constants';
import { calculateRms, rmsToDb } from './utils';
import { reportError } from './error-reporter';


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


// ─── Virtual Cable Detection ────────────────────────────────────────────────

/**
 * Known virtual audio cable name patterns.
 * Any device whose name matches one of these (case-insensitive) is classified
 * as virtual. Everything else is physical.
 */
const VIRTUAL_CABLE_PATTERNS: RegExp[] = [
  /\bvb-audio\b/i,
  /\bcable\s+(input|output)\b/i,
  /\bvoicemeeter\b/i,
  /\bvirtual\s+audio\s+cable\b/i,
  /\bvac\b/i,
  /\bblackhole\b/i,                   // macOS virtual cable
  /\bsoundflower\b/i,                 // macOS virtual cable
];

/** Check if a device name matches a known virtual cable pattern. */
export function isVirtualDevice(name: string): boolean {
  return VIRTUAL_CABLE_PATTERNS.some((p) => p.test(name));
}

/**
 * Extract a canonical cable name from a device name for line-pair matching.
 *
 * Examples:
 *   "CABLE Output (VB-Audio Virtual Cable)" → "VB-Audio Virtual Cable"
 *   "CABLE Input (VB-Audio Virtual Cable)"  → "VB-Audio Virtual Cable"
 *   "Line 1 (Virtual Audio Cable)"          → "Virtual Audio Cable"
 *   "VoiceMeeter Output (VB-Audio ...)"     → "VB-Audio ..."
 *
 * Strategy: extract the parenthesised suffix first; fall back to the full name
 * with Input/Output stripped.
 */
function extractCanonicalCableName(deviceName: string): string {
  // Try to extract text inside parentheses
  const parenMatch = deviceName.match(/\((.+?)\)/);
  if (parenMatch) return parenMatch[1].trim();

  // Fall back: strip Input/Output keywords
  return deviceName
    .replace(/\b(input|output)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}


// ─── Device Enumeration ─────────────────────────────────────────────────────

export interface DeviceInfo {
  id: number;
  name: string;
  isVirtual: boolean;
}

export function listMicrophones(): DeviceInfo[] {
  try {
    const rt = createRtAudio();
    return rt.getDevices()
      .filter((d) => d.inputChannels > 0)
      .map((d) => ({ id: d.id, name: d.name, isVirtual: isVirtualDevice(d.name) }));
  } catch (err) {
    console.error('[AudioService] Failed to list input devices', err);
    reportError('Failed to list microphones. Check your audio drivers.', 'Audio Devices');
    return [];
  }
}

export function listSpeakers(): DeviceInfo[] {
  try {
    const rt = createRtAudio();
    return rt.getDevices()
      .filter((d) => d.outputChannels > 0)
      .map((d) => ({ id: d.id, name: d.name, isVirtual: isVirtualDevice(d.name) }));
  } catch (err) {
    console.error('[AudioService] Failed to list output devices', err);
    reportError('Failed to list speakers. Check your audio drivers.', 'Audio Devices');
    return [];
  }
}

/** List only physical (non-virtual) microphones. */
export function listPhysicalMicrophones(): DeviceInfo[] {
  return listMicrophones().filter((d) => !d.isVirtual);
}

/** List only physical (non-virtual) speakers. */
export function listPhysicalSpeakers(): DeviceInfo[] {
  return listSpeakers().filter((d) => !d.isVirtual);
}

export function getDefaultInputDeviceId(): number {
  try {
    return createRtAudio().getDefaultInputDevice();
  } catch (err) {
    return 0;
  }
}

export function getDefaultOutputDeviceId(): number {
  try {
    return createRtAudio().getDefaultOutputDevice();
  } catch (err) {
    return 0;
  }
}

// ─── Virtual Device Enumeration ───────────────────────────────────────────────

import type { VirtualDeviceInfo } from '../../shared/ipc';

/**
 * Enumerate virtual audio virtualDevices by pairing virtual input and output devices
 * that share the same canonical cable name.
 */
export function listVirtualDevices(): VirtualDeviceInfo[] {
  try {
    const rt = createRtAudio();
    const allDevices = rt.getDevices();

    // Collect virtual inputs and outputs
    const virtualInputs = allDevices.filter((d) => d.inputChannels > 0 && isVirtualDevice(d.name));
    const virtualOutputs = allDevices.filter((d) => d.outputChannels > 0 && isVirtualDevice(d.name));

    const virtualDevices: VirtualDeviceInfo[] = [];
    const usedOutputIds = new Set<number>();

    for (const input of virtualInputs) {
      const inputCanonical = extractCanonicalCableName(input.name);

      // Find matching output with same canonical name
      const matchingOutput = virtualOutputs.find((o) => {
        if (usedOutputIds.has(o.id)) return false;
        return extractCanonicalCableName(o.name) === inputCanonical;
      });

      if (matchingOutput) {
        usedOutputIds.add(matchingOutput.id);
        virtualDevices.push({
          deviceId: inputCanonical,
          deviceName: inputCanonical,
          inputDeviceId: input.id,
          outputDeviceId: matchingOutput.id,
        });
      }
    }

    return virtualDevices;
  } catch (err) {
    console.error('[AudioService] Failed to list virtual devices', err);
    reportError('Failed to detect virtual audio cables. Ensure VB-CABLE or similar is installed.', 'Audio Devices');
    return [];
  }
}

/** Find a virtual device by its deviceId. */
export function findVirtualDevice(deviceId: string): VirtualDeviceInfo | undefined {
  return listVirtualDevices().find((d) => d.deviceId === deviceId);
}

/**
 * Look up a device's output channel count.
 * Falls back to 2 (stereo) if the device isn't found.
 */
function getOutputChannelCount(deviceId: number): number {
  try {
    const rt = createRtAudio();
    const dev = rt.getDevices().find((d) => d.id === deviceId);
    return dev?.outputChannels || 2;
  } catch {
    return 2;
  }
}

/**
 * Extract mono channel 0 from an interleaved Int16 PCM buffer.
 * Applies a gain multiplier and clamps to Int16 range [-32768, 32767].
 */
export function extractMonoWithGain(pcmBuffer: Buffer, channels: number, gain: number): Float32Array {
  const totalSamples = pcmBuffer.length / 2; // 2 bytes per int16
  const monoSamples = totalSamples / channels;
  const float32 = new Float32Array(monoSamples);
  for (let i = 0; i < monoSamples; i++) {
    const raw = pcmBuffer.readInt16LE(i * channels * 2);
    float32[i] = Math.max(-32768, Math.min(32767, raw * gain));
  }
  return float32;
}

/**
 * Write mono SINT16 data to a (possibly multi-channel) RtAudio speaker.
 * Handles mono → multi-channel duplication.
 *
 * @param rtAudio - The RtAudio output stream to write to
 * @param monoData - Mono samples: Buffer (raw SINT16) or Float32Array (Int16-range values)
 * @param outChannels - Number of output channels on the speaker device
 */
export function writeMonoToSpeaker(rtAudio: RtAudio, monoData: Buffer | Float32Array, outChannels: number): void {
  // Fast path: mono speaker + Buffer input → pass through
  if (outChannels === 1 && Buffer.isBuffer(monoData)) {
    rtAudio.write(monoData);
    return;
  }

  const sampleCount = Buffer.isBuffer(monoData) ? monoData.length / 2 : monoData.length;
  const buf = Buffer.alloc(sampleCount * outChannels * 2);

  for (let i = 0; i < sampleCount; i++) {
    const sample = Buffer.isBuffer(monoData)
      ? monoData.readInt16LE(i * 2)
      : Math.max(-32768, Math.min(32767, monoData[i] | 0));
    for (let ch = 0; ch < outChannels; ch++) {
      buf.writeInt16LE(sample, (i * outChannels + ch) * 2);
    }
  }

  rtAudio.write(buf);
}

// ─── Listen Stream (Mic -> Speaker) ─────────────────────────────────────────

let listenAudio: RtAudio | null = null;

export function startListen(inputDeviceId: number, outputDeviceId: number): void {
  stopListen();

  const outChannels = getOutputChannelCount(outputDeviceId);

  try {
    listenAudio = createRtAudio();

    // Input is mono; output must match the device's actual channel count.
    // When input and output channel counts differ, RtAudio handles resampling
    // for duplex streams — we open with matching channels and duplicate if needed.
    listenAudio.openStream(
      { deviceId: outputDeviceId, nChannels: outChannels },
      { deviceId: inputDeviceId, nChannels: MIC_CHANNELS },
      AUDIO_FORMAT,
      SAMPLE_RATE,
      FRAME_SIZE,
      'ListenStream',
      (inputData: Buffer) => {
        if (!listenAudio || !listenAudio.isStreamRunning()) return;
        writeMonoToSpeaker(listenAudio, inputData, outChannels);
      },
      null
    );
    listenAudio.start();
    console.log(`[AudioService] Started listen stream: device ${inputDeviceId} -> device ${outputDeviceId} (${outChannels}ch)`);
  } catch (err) {
    console.error('[AudioService] Failed to start listen stream:', err);
    reportError('Failed to start listen stream. The selected audio device may be in use or unavailable.', 'Listen Stream');
    listenAudio = null;
  }
}

export function stopListen(): void {
  if (listenAudio) {
    try {
      if (listenAudio.isStreamRunning()) {
        listenAudio.stop();
      }
      if (listenAudio.isStreamOpen()) {
        listenAudio.closeStream();
      }
    } catch (err) {
      console.error('[AudioService] Error stopping listen stream:', err);
    }
    listenAudio = null;
    console.log('[AudioService] Stopped listen stream');
  }
}

// ─── Mic Test (Capture → Denoise → RMS Level + Speaker Output) ──────────────

let micTestPipeline: AudioPipeline | null = null;
let micTestOutput: RtAudio | null = null;
let micTestOutChannels = 1;

export async function startMicTest(micId: number, speakerId: number, onLevel: (level: number) => void): Promise<void> {
  stopMicTest();
  try {
    // Resolve output speaker (fall back to default if 0 or invalid)
    const resolvedSpeakerId = speakerId > 0 ? speakerId : getDefaultOutputDeviceId();

    // Open an output stream for speaker loopback (Int16 PCM — matches pipeline format)
    micTestOutChannels = getOutputChannelCount(resolvedSpeakerId);
    micTestOutput = createRtAudio();
    micTestOutput.openStream(
      { deviceId: resolvedSpeakerId, nChannels: micTestOutChannels },
      null,
      AUDIO_FORMAT,
      SAMPLE_RATE,
      FRAME_SIZE,
      'MicTestOutput',
      null,
      null,
    );
    micTestOutput.start();
    console.log(`[AudioService] Mic test speaker output: device ${resolvedSpeakerId} (${micTestOutChannels}ch)`);

    micTestPipeline = new AudioPipeline({
      onFrame: (level) => {
        onLevel(level);
      },
      onDenoisedFrame: (frame) => {
        if (!micTestOutput || !micTestOutput.isStreamRunning()) return;
        try {
          writeMonoToSpeaker(micTestOutput, frame, micTestOutChannels);
        } catch (err) {
          console.error('[AudioService] Error writing to mic test output:', err);
        }
      },
    });
    await micTestPipeline.start(micId);
    console.log(`[AudioService] Started mic test for mic: ${micId}, speaker: ${resolvedSpeakerId}`);
  } catch (err) {
    console.error('[AudioService] Failed to start mic test:', err);
    reportError('Failed to start microphone test. The device may be in use or disconnected.', 'Mic Test');
    stopMicTest();
  }
}

export async function stopMicTest(): Promise<void> {
  if (micTestPipeline) {
    await micTestPipeline.stop();
    micTestPipeline = null;
  }
  if (micTestOutput) {
    try {
      if (micTestOutput.isStreamRunning()) micTestOutput.stop();
      if (micTestOutput.isStreamOpen()) micTestOutput.closeStream();
    } catch (err) {
      console.warn('[AudioService] Error stopping mic test output:', err);
    }
    micTestOutput = null;
  }
  console.log('[AudioService] Stopped mic test');
}

// ─── PCM Playback ───────────────────────────────────────────────────────────

/**
 * Play a mono Float32Array (Int16-range values) through the specified output device.
 * Automatically converts mono → stereo if the device requires it.
 */
export function playPcm(pcm: Float32Array, sampleRate: number, outputDeviceId: number): void {
  try {
    const rt = createRtAudio();
    const frameSize = 480;
    const outChannels = getOutputChannelCount(outputDeviceId);

    rt.openStream(
      { deviceId: outputDeviceId, nChannels: outChannels },
      null,
      AUDIO_FORMAT,
      sampleRate,
      frameSize,
      'PcmPlayback',
      null,
      null
    );

    // Audio is already in Int16 range — use directly
    let totalFrames = 0;
    for (let offset = 0; offset < pcm.length; offset += frameSize) {
      const remaining = pcm.length - offset;
      const chunkLen = Math.min(remaining, frameSize);
      const chunk = pcm.subarray(offset, offset + chunkLen);

      // Pad last chunk if needed
      let frame: Float32Array;
      if (chunkLen < frameSize) {
        frame = new Float32Array(frameSize);
        frame.set(chunk);
      } else {
        frame = chunk;
      }

      writeMonoToSpeaker(rt, frame, outChannels);
      totalFrames++;
    }

    // Track played frames and clean up when done
    let playedFrames = 0;
    rt.setFrameOutputCallback(() => {
      playedFrames++;
      if (playedFrames >= totalFrames) {
        try {
          if (rt.isStreamRunning()) rt.stop();
          if (rt.isStreamOpen()) rt.closeStream();
        } catch (e) { }
      }
    });

    rt.start();
    console.log(`[AudioService] Playing PCM: ${totalFrames} frames, ${outChannels}ch on device ${outputDeviceId}`);
  } catch (err) {
    console.error('[AudioService] Failed to play PCM:', err);
    reportError('Failed to play audio. The output device may be unavailable.', 'Audio Playback');
  }
}

// ─── Forward Device Output (persistent stream) ────────────────────────────────

let forwardDeviceOutput: RtAudio | null = null;
let forwardDeviceOutChannels = 1;

/**
 * Open a persistent output stream to the forward device's output device.
 * Call once when the voice session starts.
 *
 * Resolves the output device from the virtual device by deviceId.
 */
export function startForwardDeviceOutput(deviceId: string, sampleRate: number = SAMPLE_RATE): void {
  stopForwardDeviceOutput();
  try {
    const virtualDevice = findVirtualDevice(deviceId);
    if (!virtualDevice) {
      console.error(`[AudioService] Forward device '${deviceId}' not found`);
      reportError(`Forward device '${deviceId}' not found. Please re-select your virtual device.`, 'Forward Device');
      return;
    }

    const outputDeviceId = virtualDevice.outputDeviceId;
    const rt = createRtAudio();

    forwardDeviceOutChannels = getOutputChannelCount(outputDeviceId);
    forwardDeviceOutput = rt;
    forwardDeviceOutput.openStream(
      { deviceId: outputDeviceId, nChannels: forwardDeviceOutChannels },
      null,
      AUDIO_FORMAT,
      sampleRate,
      FRAME_SIZE,
      'ForwardDeviceOutput',
      null,
      null,
    );
    forwardDeviceOutput.start();
    console.log(`[AudioService] Forward device output started: device '${deviceId}' → device ${outputDeviceId} (${forwardDeviceOutChannels}ch)`);
  } catch (err) {
    console.error('[AudioService] Failed to start forward device output:', err);
    reportError('Failed to open forward device output. The virtual cable may be in use or disconnected.', 'Forward Device');
    forwardDeviceOutput = null;
  }
}

/**
 * Write mono Float32Array (Int16-range values) to the forward device.
 * Stream must be open via startForwardDeviceOutput().
 */
export function writeToForwardDevice(pcm: Float32Array): void {
  if (!forwardDeviceOutput || !forwardDeviceOutput.isStreamRunning()) return;
  try {
    for (let offset = 0; offset < pcm.length; offset += FRAME_SIZE) {
      const remaining = pcm.length - offset;
      const chunkLen = Math.min(remaining, FRAME_SIZE);
      const chunk = pcm.subarray(offset, offset + chunkLen);

      let frame: Float32Array;
      if (chunkLen < FRAME_SIZE) {
        frame = new Float32Array(FRAME_SIZE);
        frame.set(chunk);
      } else {
        frame = chunk;
      }

      // Use writeMonoToSpeaker to handle mono → multi-channel duplication
      writeMonoToSpeaker(forwardDeviceOutput, frame, forwardDeviceOutChannels);
    }
  } catch (err) {
    console.error('[AudioService] Error writing to forward device:', err);
    reportError('Error writing audio to forward device. The stream may have been interrupted.', 'Forward Device');
  }
}

/**
 * Close the forward device output stream.
 * Call when the voice session ends.
 */
export function stopForwardDeviceOutput(): void {
  if (forwardDeviceOutput) {
    try {
      if (forwardDeviceOutput.isStreamRunning()) forwardDeviceOutput.stop();
      if (forwardDeviceOutput.isStreamOpen()) forwardDeviceOutput.closeStream();
    } catch (err) {
      console.warn('[AudioService] Error stopping forward device output:', err);
    }
    forwardDeviceOutput = null;
    console.log('[AudioService] Forward device output stopped');
  }
}

export function playSpeakerTest(outputDeviceId: number): void {
  const sampleRate = SAMPLE_RATE;
  const duration = 0.6;
  const totalSamples = Math.floor(sampleRate * duration);
  const pcm = new Float32Array(totalSamples);

  // Two-tone ascending chime: C5 (523Hz) → E5 (659Hz)
  const tone1Freq = 523.25;
  const tone2Freq = 659.25;
  const tone1End = Math.floor(totalSamples * 0.45); // first tone: ~270ms
  const tone2Start = Math.floor(totalSamples * 0.15); // overlap starts at ~90ms

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Tone 1: C5 with exponential decay
    if (i < tone1End) {
      const env1 = Math.exp(-t * 6);
      sample += Math.sin(2 * Math.PI * tone1Freq * t) * env1 * 0.35;
    }

    // Tone 2: E5 starts slightly later with its own decay
    if (i >= tone2Start) {
      const t2 = (i - tone2Start) / sampleRate;
      const env2 = Math.exp(-t2 * 5);
      sample += Math.sin(2 * Math.PI * tone2Freq * t2) * env2 * 0.35;
    }

    // Soft fade-in on the very first few ms to avoid click
    if (i < 240) {
      sample *= i / 240;
    }

    pcm[i] = sample * 32767;
  }

  playPcm(pcm, sampleRate, outputDeviceId);
}

// ─── Raw Level Meter (no denoise, no speaker) ───────────────────────────────

const RAW_INPUT_GAIN = 1;       // Unity gain — show true mic level (AGC handles amplification)

let rawLevelAudio: RtAudio | null = null;

/**
 * Start a lightweight raw audio capture that only computes dBFS.
 * No RNNoise, no noise gate, no speaker output — just raw level.
 * Sends dBFS value (e.g. -45) via the callback.
 */
export function startRawLevel(micId: number, onLevel: (db: number) => void): void {
  stopRawLevel();
  try {
    rawLevelAudio = createRtAudio();
    rawLevelAudio.openStream(
      null, // No output
      { deviceId: micId, nChannels: MIC_CHANNELS },
      AUDIO_FORMAT,
      SAMPLE_RATE,
      FRAME_SIZE,
      'RawLevelMeter',
      (pcmBuffer: Buffer) => {
        const mono = extractMonoWithGain(pcmBuffer, 1, RAW_INPUT_GAIN);
        const rms = calculateRms(mono);
        const db = rmsToDb(rms);
        onLevel(db);
      },
      null,
    );
    rawLevelAudio.start();
    console.log(`[AudioService] Started raw level meter for mic: ${micId}`);
  } catch (err) {
    console.error('[AudioService] Failed to start raw level meter:', err);
    reportError('Failed to start audio level meter. The microphone may be in use or disconnected.', 'Level Meter');
    stopRawLevel();
  }
}

export function stopRawLevel(): void {
  if (rawLevelAudio) {
    try {
      if (rawLevelAudio.isStreamRunning()) rawLevelAudio.stop();
      if (rawLevelAudio.isStreamOpen()) rawLevelAudio.closeStream();
    } catch (err) {
      console.warn('[AudioService] Error stopping raw level meter:', err);
    }
    rawLevelAudio = null;
    console.log('[AudioService] Stopped raw level meter');
  }
}

