/**
 * Opus codec utility for the VoiceWorker server.
 *
 * Encodes and decodes audio using the Opus codec for efficient
 * WebSocket transfer between client and server.
 *
 * Binary format:
 *   [4 bytes] magic: "OPUS"
 *   [2 bytes] frame count (uint16 LE)
 *   For each frame:
 *     [2 bytes] frame size (uint16 LE)
 *     [N bytes] Opus-encoded frame data
 */

import OpusScript from "opusscript";
import { createChildLogger } from "../utils/index.js";

const log = createChildLogger({ module: "opus-codec" });

const OPUS_MAGIC = Buffer.from("OPUS");
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const FRAME_DURATION_MS = 20;

// Reusable codec instances
let decoder: OpusScript | null = null;
let encoder: OpusScript | null = null;

function getDecoder(): OpusScript {
  if (!decoder) {
    decoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);
  }
  return decoder;
}

function getEncoder(): OpusScript {
  if (!encoder) {
    encoder = new OpusScript(SAMPLE_RATE, CHANNELS, OpusScript.Application.VOIP);
  }
  return encoder;
}

/**
 * Check if a binary buffer starts with the OPUS magic header.
 */
export function isOpusEncoded(data: Buffer): boolean {
  return data.length >= 6 && data.subarray(0, 4).equals(OPUS_MAGIC);
}

/**
 * Decode an Opus-framed binary message back to PCM Int16 audio.
 * Returns a Buffer containing interleaved Int16 PCM samples.
 */
export function decodeOpus(data: Buffer): Buffer {
  const dec = getDecoder();

  const frameCount = data.readUInt16LE(4);
  let offset = 6;

  const pcmChunks: Buffer[] = [];

  for (let i = 0; i < frameCount; i++) {
    if (offset + 2 > data.length) {
      log.warn({ frame: i, frameCount }, "Truncated Opus frame header");
      break;
    }

    const frameSize = data.readUInt16LE(offset);
    offset += 2;

    if (offset + frameSize > data.length) {
      log.warn({ frame: i, frameSize, remaining: data.length - offset }, "Truncated Opus frame data");
      break;
    }

    const frameData = data.subarray(offset, offset + frameSize);
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
 * Output: Buffer with OPUS magic + length-prefixed Opus frames.
 */
export function encodeOpus(pcmInt16: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const enc = getEncoder();
  const frameSamples = (sampleRate * FRAME_DURATION_MS) / 1000; // samples per frame
  const frameSizeBytes = frameSamples * 2 * CHANNELS; // 2 bytes per Int16 sample
  const totalSamples = pcmInt16.length / 2;
  const frameCount = Math.ceil(totalSamples / frameSamples);

  const encodedFrames: Buffer[] = [];

  for (let i = 0; i < frameCount; i++) {
    const start = i * frameSizeBytes;
    let frameBuffer: Buffer;

    if (start + frameSizeBytes <= pcmInt16.length) {
      frameBuffer = pcmInt16.subarray(start, start + frameSizeBytes);
    } else {
      // Pad the last frame with silence if not a full frame
      frameBuffer = Buffer.alloc(frameSizeBytes);
      pcmInt16.copy(frameBuffer, 0, start);
    }

    try {
      const encoded = enc.encode(frameBuffer, frameSamples);
      encodedFrames.push(Buffer.from(encoded));
    } catch (err) {
      log.warn({ frame: i, err }, "Failed to encode Opus frame, skipping");
    }
  }

  // Pack into our binary format
  const totalSize = 4 + 2 + encodedFrames.reduce((sum, f) => sum + 2 + f.length, 0);
  const output = Buffer.alloc(totalSize);
  let offset = 0;

  // Magic
  OPUS_MAGIC.copy(output, offset);
  offset += 4;

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

/**
 * Convert PCM Int16 buffer to Float32 buffer.
 */
export function pcmInt16ToFloat32(int16Buffer: Buffer): Buffer {
  const sampleCount = int16Buffer.length / 2;
  const float32 = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    float32[i] = int16Buffer.readInt16LE(i * 2) / 32768;
  }

  return Buffer.from(float32.buffer);
}
