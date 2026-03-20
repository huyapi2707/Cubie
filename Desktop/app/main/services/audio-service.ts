import { RtAudio, RtAudioFormat } from 'audify';
import { AudioPipeline } from './audio-pipeline';

// ─── Device Enumeration ─────────────────────────────────────────────────────

export function listInputDevices(): { id: number; name: string }[] {
  try {
    const rt = new RtAudio();
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
    const rt = new RtAudio();
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
    return new RtAudio().getDefaultInputDevice();
  } catch (err) {
    return 0;
  }
}

export function getDefaultOutputDeviceId(): number {
  try {
    return new RtAudio().getDefaultOutputDevice();
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
    const rt = new RtAudio();
    const dev = rt.getDevices().find((d) => d.id === deviceId);
    return dev?.outputChannels || 2;
  } catch {
    return 2;
  }
}

// ─── Listen Stream (Mic -> Speaker) ─────────────────────────────────────────

let listenAudio: RtAudio | null = null;

export function startListen(inputDeviceId: number, outputDeviceId: number): void {
  stopListen();

  const outChannels = getOutputChannelCount(outputDeviceId);

  try {
    listenAudio = new RtAudio();

    // Input is mono; output must match the device's actual channel count.
    // When input and output channel counts differ, RtAudio handles resampling
    // for duplex streams — we open with matching channels and duplicate if needed.
    listenAudio.openStream(
      { deviceId: outputDeviceId, nChannels: outChannels },
      { deviceId: inputDeviceId, nChannels: 1 },
      RtAudioFormat.RTAUDIO_SINT16,
      48000,
      480,
      'ListenStream',
      (inputData: Buffer) => {
        if (!listenAudio || !listenAudio.isStreamRunning()) return;

        if (outChannels === 1) {
          // Mono → mono: pass through
          listenAudio.write(inputData);
        } else {
          // Mono → stereo: duplicate each sample across channels
          const monoSamples = inputData.length / 2; // 16-bit = 2 bytes per sample
          const stereo = Buffer.alloc(monoSamples * 2 * outChannels);
          for (let i = 0; i < monoSamples; i++) {
            const sample = inputData.readInt16LE(i * 2);
            for (let ch = 0; ch < outChannels; ch++) {
              stereo.writeInt16LE(sample, (i * outChannels + ch) * 2);
            }
          }
          listenAudio.write(stereo);
        }
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

// ─── Mic Test (Capture -> Denoise -> RMS Level) ─────────────────────────────

let micTestPipeline: AudioPipeline | null = null;

export async function startMicTest(deviceId: number, onLevel: (level: number) => void): Promise<void> {
  stopMicTest();
  try {
    micTestPipeline = new AudioPipeline({
      onFrame: (level) => {
        onLevel(level);
      },
    });
    await micTestPipeline.start(deviceId);
    console.log(`[AudioService] Started mic test for device: ${deviceId}`);
  } catch (err) {
    console.error('[AudioService] Failed to start mic test:', err);
    micTestPipeline = null;
  }
}

export function stopMicTest(): void {
  if (micTestPipeline) {
    micTestPipeline.stop();
    micTestPipeline = null;
    console.log('[AudioService] Stopped mic test');
  }
}

// ─── PCM Playback ───────────────────────────────────────────────────────────

/**
 * Play a mono Float32Array through the specified output device.
 * Automatically converts mono → stereo if the device requires it.
 */
export function playPcm(pcm: Float32Array, sampleRate: number, outputDeviceId: number): void {
  try {
    const rt = new RtAudio();
    const frameSize = 480;
    const outChannels = getOutputChannelCount(outputDeviceId);

    rt.openStream(
      { deviceId: outputDeviceId, nChannels: outChannels },
      null,
      RtAudioFormat.RTAUDIO_FLOAT32,
      sampleRate,
      frameSize,
      'PcmPlayback',
      null,
      null
    );

    // Convert mono PCM → interleaved stereo if needed
    let outPcm: Float32Array;
    if (outChannels > 1) {
      outPcm = new Float32Array(pcm.length * outChannels);
      for (let i = 0; i < pcm.length; i++) {
        for (let ch = 0; ch < outChannels; ch++) {
          outPcm[i * outChannels + ch] = pcm[i];
        }
      }
    } else {
      outPcm = pcm;
    }

    const frameBytes = frameSize * outChannels * 4; // float32 = 4 bytes per sample
    const buffer = Buffer.from(outPcm.buffer, outPcm.byteOffset, outPcm.byteLength);

    // Queue all frames before starting — RtAudio plays them sequentially
    let totalFrames = 0;
    for (let offset = 0; offset < buffer.length; offset += frameBytes) {
      const remaining = buffer.length - offset;
      const chunkLength = Math.min(remaining, frameBytes);
      const chunk = buffer.subarray(offset, offset + chunkLength);

      if (chunk.length < frameBytes) {
        const padded = Buffer.alloc(frameBytes);
        chunk.copy(padded);
        rt.write(padded);
      } else {
        rt.write(chunk);
      }
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
        } catch (e) {}
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
  const sampleRate = 48000;
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
