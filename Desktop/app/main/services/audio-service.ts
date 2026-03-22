import { RtAudio, RtAudioFormat, RtAudioApi } from 'audify';
import { AudioPipeline } from './audio-pipeline';
import { SOURCE_SAMPLE_RATE } from './voice-service';
import { calculateRms } from './utils';


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


// ─── Device Enumeration ─────────────────────────────────────────────────────

export function listInputDevices(): { id: number; name: string }[] {
  try {
    const rt = createRtAudio();
    return rt.getDevices()
      .filter((d) => d.inputChannels > 0)
      .map((d) => ({ id: d.id, name: d.name }));
  } catch (err) {
    console.error('[AudioService] Failed to list input devices', err);
    return [];
  }
}

export function listOutputDevices(): { id: number; name: string }[] {
  try {
    const rt = createRtAudio();
    return rt.getDevices()
      .filter((d) => d.outputChannels > 0)
      .map((d) => ({ id: d.id, name: d.name }));
  } catch (err) {
    console.error('[AudioService] Failed to list output devices', err);
    return [];
  }
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
 * Extract mono channel 0 from an interleaved stereo Int16 PCM buffer.
 * Applies a gain multiplier and clamps to Int16 range [-32768, 32767].
 */
export function extractMonoWithGain(pcmBuffer: Buffer, channels: number, gain: number): Float32Array {
  const totalInt16Samples = pcmBuffer.length / 2;
  const monoSamples = totalInt16Samples / channels;
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
      { deviceId: inputDeviceId, nChannels: 1 },
      RtAudioFormat.RTAUDIO_SINT16,
      SOURCE_SAMPLE_RATE,
      480,
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
      RtAudioFormat.RTAUDIO_SINT16,
      SOURCE_SAMPLE_RATE,
      480,
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
    stopMicTest();
  }
}

export function stopMicTest(): void {
  if (micTestPipeline) {
    micTestPipeline.stop();
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
 * Play a mono Float32Array through the specified output device.
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
      RtAudioFormat.RTAUDIO_SINT16,
      sampleRate,
      frameSize,
      'PcmPlayback',
      null,
      null
    );

    // Convert normalized Float32 [-1,1] → Int16-range Float32Array
    const int16Pcm = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      int16Pcm[i] = Math.max(-32768, Math.min(32767, pcm[i] * 32768));
    }

    let totalFrames = 0;
    for (let offset = 0; offset < int16Pcm.length; offset += frameSize) {
      const remaining = int16Pcm.length - offset;
      const chunkLen = Math.min(remaining, frameSize);
      const chunk = int16Pcm.subarray(offset, offset + chunkLen);

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
  }
}

// ─── Speaker Test ───────────────────────────────────────────────────────────

export function playSpeakerTest(outputDeviceId: number): void {
  const sampleRate = SOURCE_SAMPLE_RATE;
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

    pcm[i] = sample;
  }

  playPcm(pcm, sampleRate, outputDeviceId);
}
