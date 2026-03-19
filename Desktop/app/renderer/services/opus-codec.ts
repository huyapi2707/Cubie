/**
 * Opus Audio Codec Utils
 *
 * Encodes/Decodes Opus-framed binary messages using the WebCodecs API
 * (AudioEncoder and AudioDecoder) for WebSocket transfer.
 *
 * Binary format (Header + Frames):
 *   [4 bytes] magic: "OPUS"
 *   [2 bytes] sample rate / 100 (uint16 LE) — e.g. 160 = 16000 Hz
 *   [2 bytes] frame count (uint16 LE)
 *   For each frame:
 *     [2 bytes] frame size (uint16 LE)
 *     [N bytes] Opus-encoded frame data
 */

import { SOURCE_SAMPLE_RATE } from '@/constants/audio';

const OPUS_MAGIC = [0x4f, 0x50, 0x55, 0x53]; // "OPUS"

// ─── Encoding ──────────────────────────────────────────────────────────────────

/**
 * Encode Float32Array PCM audio into a packed Opus binary blob.
 */
export async function encodeOpus(pcmFloat32: Float32Array, sampleRate = SOURCE_SAMPLE_RATE): Promise<ArrayBuffer> {
  const chunks: ArrayBuffer[] = [];

  const encoder = new AudioEncoder({
    output: (chunk: EncodedAudioChunk) => {
      const buffer = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buffer);
      chunks.push(buffer);
    },
    error: (e: DOMException) => console.error('[OpusEncoder] Error:', e),
  });

  encoder.configure({
    codec: 'opus',
    sampleRate,
    numberOfChannels: 1,
    bitrate: 32000,
  });

  const audioData = new AudioData({
    format: 'f32',
    sampleRate,
    numberOfFrames: pcmFloat32.length,
    numberOfChannels: 1,
    timestamp: 0,
    data: new Float32Array(pcmFloat32),
  });

  encoder.encode(audioData);
  await encoder.flush();
  encoder.close();
  audioData.close();

  return packOpusFrames(chunks, sampleRate);
}

/**
 * Pack multiple Opus frames into a single binary blob with our framing format.
 */
function packOpusFrames(frames: ArrayBuffer[], sampleRate: number): ArrayBuffer {
  // 4 (magic) + 2 (sampleRate) + 2 (count) + sum(2 + frame.byteLength)
  const totalSize = 4 + 2 + 2 + frames.reduce((sum, f) => sum + 2 + f.byteLength, 0);

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Magic: "OPUS"
  bytes.set(OPUS_MAGIC, offset);
  offset += 4;

  // Sample rate (divided by 100 to fit uint16)
  view.setUint16(offset, sampleRate / 100, true);
  offset += 2;

  // Frame count
  view.setUint16(offset, frames.length, true);
  offset += 2;

  // Each frame: [2 bytes size][data]
  for (const frame of frames) {
    view.setUint16(offset, frame.byteLength, true);
    offset += 2;
    bytes.set(new Uint8Array(frame), offset);
    offset += frame.byteLength;
  }

  return buffer;
}

// ─── Decoding ──────────────────────────────────────────────────────────────────

/**
 * Check if a binary message is Opus-encoded (starts with "OPUS" magic).
 */
export function isOpusEncoded(data: ArrayBuffer): boolean {
  if (data.byteLength < 8) return false;
  const view = new Uint8Array(data, 0, 4);
  return view[0] === OPUS_MAGIC[0] && view[1] === OPUS_MAGIC[1] &&
    view[2] === OPUS_MAGIC[2] && view[3] === OPUS_MAGIC[3];
}

/**
 * Parse the sample rate from an Opus-framed binary message.
 */
export function parseSampleRate(data: ArrayBuffer): number {
  const view = new DataView(data);
  return view.getUint16(4, true) * 100;
}

/**
 * Decode an Opus-framed binary message into a Float32Array of PCM samples.
 * Sample rate is read from the header automatically.
 */
export async function decodeOpus(data: ArrayBuffer): Promise<{ audio: Float32Array; sampleRate: number }> {
  const view = new DataView(data);

  // Read sample rate and frame count from header
  const sampleRate = view.getUint16(4, true) * 100;
  const frameCount = view.getUint16(6, true);
  let offset = 8;

  // Unpack frames
  const frames: ArrayBuffer[] = [];
  for (let i = 0; i < frameCount; i++) {
    if (offset + 2 > data.byteLength) break;
    const frameSize = view.getUint16(offset, true);
    offset += 2;
    if (offset + frameSize > data.byteLength) break;
    frames.push(data.slice(offset, offset + frameSize));
    offset += frameSize;
  }

  // Decode via WebCodecs AudioDecoder
  const pcmChunks: Float32Array[] = [];
  let decodedSampleRate = sampleRate; // will be overridden by actual decoder output

  const decoder = new AudioDecoder({
    output: (audioData: AudioData) => {
      // Opus internally operates at 48kHz — use the actual output sample rate
      decodedSampleRate = audioData.sampleRate;
      const samples = new Float32Array(audioData.numberOfFrames * audioData.numberOfChannels);
      audioData.copyTo(samples, { planeIndex: 0 });
      pcmChunks.push(samples);
      audioData.close();
    },
    error: (e: DOMException) => console.error('[OpusDecoder] Error:', e),
  });

  decoder.configure({
    codec: 'opus',
    sampleRate,
    numberOfChannels: 1,
  });

  // Feed each Opus frame as an EncodedAudioChunk
  let timestamp = 0;
  const frameDurationUs = 20_000; // 20ms = 20000µs (Opus default)
  for (const frame of frames) {
    const chunk = new EncodedAudioChunk({
      type: 'key',
      timestamp,
      data: frame,
    });
    decoder.decode(chunk);
    timestamp += frameDurationUs;
  }

  await decoder.flush();
  decoder.close();

  // Merge all decoded chunks
  const totalLength = pcmChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Float32Array(totalLength);
  let mergeOffset = 0;
  for (const chunk of pcmChunks) {
    merged.set(chunk, mergeOffset);
    mergeOffset += chunk.length;
  }

  return { audio: merged, sampleRate: decodedSampleRate };
}
