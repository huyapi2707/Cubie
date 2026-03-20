/**
 * Opus codec utility for the Electron main process.
 *
 * Uses opusscript (WASM-based) for encoding and decoding Opus audio.
 * This is a port of the VoiceWorker server's opus-codec.ts for the
 * main process so we can encode outgoing audio and decode incoming audio
 * without relying on the renderer's WebCodecs API.
 *
 * Binary format (matches server convention):
 *   [4 bytes] magic: "OPUS"
 *   [2 bytes] sample rate / 100 (uint16 LE) — e.g. 480 = 48000 Hz
 *   [2 bytes] frame count (uint16 LE)
 *   For each frame:
 *     [2 bytes] frame size (uint16 LE)
 *     [N bytes] Opus-encoded frame data
 */

import OpusScript from 'opusscript';

type OpusSampleRate = 8000 | 12000 | 16000 | 24000 | 48000;

const OPUS_MAGIC = Buffer.from('OPUS');
const CHANNELS = 1;
const FRAME_DURATION_MS = 20;

// ─── Detection ──────────────────────────────────────────────────────────────

export function isOpusEncoded(data: Buffer | Uint8Array): boolean {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.length >= 8 && buf.subarray(0, 4).equals(OPUS_MAGIC);
}

export function parseSampleRate(data: Buffer | Uint8Array): number {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.readUInt16LE(4) * 100;
}

// ─── Encoding ───────────────────────────────────────────────────────────────

/**
 * Encode Float32Array PCM audio into an Opus-framed binary buffer.
 *
 * Converts float32 [-1, 1] → int16 before encoding with OpusScript.
 */
export function encodeOpus(pcmFloat32: Float32Array, sampleRate: number): Buffer {
  // Convert Float32 → Int16
  const int16 = float32ToInt16(pcmFloat32);
  const pcm = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);

  const enc = new OpusScript(sampleRate as OpusSampleRate, CHANNELS, OpusScript.Application.VOIP);
  const frameSamples = (sampleRate * FRAME_DURATION_MS) / 1000;
  const frameSizeBytes = frameSamples * 2 * CHANNELS; // 2 bytes per Int16 sample
  const totalSamples = pcm.length / 2;
  const frameCount = Math.ceil(totalSamples / frameSamples);

  const encodedFrames: Buffer[] = [];

  for (let i = 0; i < frameCount; i++) {
    const start = i * frameSizeBytes;
    let frameBuffer: Buffer;

    if (start + frameSizeBytes <= pcm.length) {
      frameBuffer = pcm.subarray(start, start + frameSizeBytes);
    } else {
      // Pad the last frame with silence
      frameBuffer = Buffer.alloc(frameSizeBytes);
      pcm.copy(frameBuffer, 0, start);
    }

    try {
      const encoded = enc.encode(frameBuffer, frameSamples);
      encodedFrames.push(Buffer.from(encoded));
    } catch {
      console.warn(`[OpusCodec] Failed to encode frame ${i}, skipping`);
    }
  }

  return packFrames(encodedFrames, sampleRate);
}

// ─── Decoding ───────────────────────────────────────────────────────────────

/**
 * Decode an Opus-framed binary message back to Float32Array PCM audio.
 * Returns the decoded samples and the sample rate read from the header.
 */
export function decodeOpus(data: Buffer | Uint8Array): { audio: Float32Array; sampleRate: number } {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sampleRate = buf.readUInt16LE(4) * 100;
  const frameCount = buf.readUInt16LE(6);
  let offset = 8;

  const dec = new OpusScript(sampleRate as OpusSampleRate, CHANNELS, OpusScript.Application.VOIP);
  const pcmChunks: Buffer[] = [];

  for (let i = 0; i < frameCount; i++) {
    if (offset + 2 > buf.length) break;

    const frameSize = buf.readUInt16LE(offset);
    offset += 2;

    if (offset + frameSize > buf.length) break;

    const frameData = buf.subarray(offset, offset + frameSize);
    offset += frameSize;

    try {
      const pcm = dec.decode(frameData);
      pcmChunks.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    } catch {
      console.warn(`[OpusCodec] Failed to decode frame ${i}, skipping`);
    }
  }

  const pcmInt16 = Buffer.concat(pcmChunks);
  const audio = int16ToFloat32(pcmInt16);

  return { audio, sampleRate };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function packFrames(frames: Buffer[], sampleRate: number): Buffer {
  const totalSize = 4 + 2 + 2 + frames.reduce((sum, f) => sum + 2 + f.length, 0);
  const output = Buffer.alloc(totalSize);
  let offset = 0;

  // Magic
  OPUS_MAGIC.copy(output, offset);
  offset += 4;

  // Sample rate / 100
  output.writeUInt16LE(sampleRate / 100, offset);
  offset += 2;

  // Frame count
  output.writeUInt16LE(frames.length, offset);
  offset += 2;

  for (const frame of frames) {
    output.writeUInt16LE(frame.length, offset);
    offset += 2;
    frame.copy(output, offset);
    offset += frame.length;
  }

  return output;
}

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

function int16ToFloat32(int16Buf: Buffer): Float32Array {
  const sampleCount = int16Buf.length / 2;
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const sample = int16Buf.readInt16LE(i * 2);
    float32[i] = sample / (sample < 0 ? 0x8000 : 0x7FFF);
  }
  return float32;
}
