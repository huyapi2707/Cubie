/**
 * Opus codec utility for the VoiceWorker server.
 *
 * Encodes and decodes audio using the Opus codec for efficient
 * WebSocket transfer between client and server.
 *
 * Binary format:
 *   [4 bytes] magic: "OPUS"
 *   [2 bytes] sample rate / 100 (uint16 LE) — e.g. 160 = 16000 Hz
 *   [2 bytes] frame count (uint16 LE)
 *   For each frame:
 *     [2 bytes] frame size (uint16 LE)
 *     [N bytes] Opus-encoded frame data
 */

import OpusScript from "opusscript";
import { createChildLogger } from "../utils/index.js";

const log = createChildLogger({ module: "opus-codec" });

const OPUS_MAGIC = Buffer.from("OPUS");
const CHANNELS = 1;
const FRAME_DURATION_MS = 20;

/**
 * Check if a binary buffer starts with the OPUS magic header.
 */
export function isOpusEncoded(data: Buffer | Uint8Array): boolean {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.length >= 8 && buf.subarray(0, 4).equals(OPUS_MAGIC);
}

/**
 * Parse the sample rate from an Opus-framed binary message.
 */
export function parseSampleRate(data: Buffer | Uint8Array): number {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf.readUInt16LE(4) * 100;
}

/**
 * Decode an Opus-framed binary message back to PCM Int16 audio.
 * Returns a Buffer containing interleaved Int16 PCM samples.
 */
export function decodeOpus(data: Buffer | Uint8Array): Buffer {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sampleRate = buf.readUInt16LE(4) * 100;
  const frameCount = buf.readUInt16LE(6);
  let offset = 8;

  const dec = new OpusScript(sampleRate as any, CHANNELS, OpusScript.Application.VOIP);
  const pcmChunks: Buffer[] = [];

  for (let i = 0; i < frameCount; i++) {
    if (offset + 2 > buf.length) {
      log.warn({ frame: i, frameCount }, "Truncated Opus frame header");
      break;
    }

    const frameSize = buf.readUInt16LE(offset);
    offset += 2;

    if (offset + frameSize > buf.length) {
      log.warn({ frame: i, frameSize, remaining: buf.length - offset }, "Truncated Opus frame data");
      break;
    }

    const frameData = buf.subarray(offset, offset + frameSize);
    offset += frameSize;

    try {
      const pcm = dec.decode(frameData);
      pcmChunks.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    } catch (err) {
      log.warn({ frame: i, err }, "Failed to decode Opus frame, skipping");
    }
  }

  return Buffer.concat(pcmChunks);
}

/**
 * Encode PCM Int16 audio into an Opus-framed binary message.
 * Input: Buffer of interleaved Int16 PCM samples.
 * Output: Buffer with OPUS magic + sample rate + length-prefixed Opus frames.
 */
export function encodeOpus(pcmInt16: Buffer | Uint8Array, sampleRate: number): Buffer {
  const pcm = Buffer.isBuffer(pcmInt16) ? pcmInt16 : Buffer.from(pcmInt16);
  const enc = new OpusScript(sampleRate as any, CHANNELS, OpusScript.Application.VOIP);
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
      // Pad the last frame with silence if not a full frame
      frameBuffer = Buffer.alloc(frameSizeBytes);
      pcm.copy(frameBuffer, 0, start);
    }

    try {
      const encoded = enc.encode(frameBuffer, frameSamples);
      encodedFrames.push(Buffer.from(encoded));
    } catch (err) {
      log.warn({ frame: i, err }, "Failed to encode Opus frame, skipping");
    }
  }

  // Pack into our binary format
  // 4 (magic) + 2 (sampleRate) + 2 (count) + sum(2 + frame.length)
  const totalSize = 4 + 2 + 2 + encodedFrames.reduce((sum, f) => sum + 2 + f.length, 0);
  const output = Buffer.alloc(totalSize);
  let offset = 0;

  // Magic
  OPUS_MAGIC.copy(output, offset);
  offset += 4;

  // Sample rate (divided by 100 to fit uint16)
  output.writeUInt16LE(sampleRate / 100, offset);
  offset += 2;

  // Frame count
  output.writeUInt16LE(encodedFrames.length, offset);
  offset += 2;

  // Frames
  for (const frame of encodedFrames) {
    output.writeUInt16LE(frame.length, offset);
    offset += 2;
    frame.copy(output, offset);
    offset += frame.length;
  }

  return output;
}
