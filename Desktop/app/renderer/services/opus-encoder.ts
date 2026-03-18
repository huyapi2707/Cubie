/**
 * Opus encoding utility using the WebCodecs AudioEncoder API.
 *
 * Encodes Float32Array PCM audio into a binary message
 * containing length-prefixed Opus frames for WebSocket transfer.
 *
 * Binary format:
 *   [4 bytes] magic: "OPUS"
 *   [2 bytes] sample rate / 100 (uint16 LE) — e.g. 160 = 16000 Hz
 *   [2 bytes] frame count (uint16 LE)
 *   For each frame:
 *     [2 bytes] frame size (uint16 LE)
 *     [N bytes] Opus-encoded frame data
 */

/**
 * Encode Float32Array PCM audio into a packed Opus binary blob.
 */
export async function encodeOpus(pcmFloat32: Float32Array, sampleRate = 16000): Promise<ArrayBuffer> {
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
    data: pcmFloat32,
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
  const totalSize =
    4 + 2 + 2 + frames.reduce((sum, f) => sum + 2 + f.byteLength, 0);

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Magic: "OPUS"
  bytes[offset++] = 0x4f; // O
  bytes[offset++] = 0x50; // P
  bytes[offset++] = 0x55; // U
  bytes[offset++] = 0x53; // S

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
