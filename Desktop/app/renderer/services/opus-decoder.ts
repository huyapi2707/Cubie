/**
 * Opus decoder for the client (browser).
 *
 * Decodes Opus-framed binary messages received from the server
 * back into Float32 PCM audio for playback.
 *
 * Uses the WebCodecs AudioDecoder API (Chromium 94+ / Electron 33+).
 *
 * Binary format (input):
 *   [4 bytes] magic: "OPUS"
 *   [2 bytes] frame count (uint16 LE)
 *   For each frame:
 *     [2 bytes] frame size (uint16 LE)
 *     [N bytes] Opus-encoded frame data
 */

const OPUS_MAGIC = [0x4f, 0x50, 0x55, 0x53]; // "OPUS"

/**
 * Check if a binary message is Opus-encoded (starts with "OPUS" magic).
 */
export function isOpusEncoded(data: ArrayBuffer): boolean {
  if (data.byteLength < 6) return false;
  const view = new Uint8Array(data, 0, 4);
  return view[0] === OPUS_MAGIC[0] && view[1] === OPUS_MAGIC[1] &&
         view[2] === OPUS_MAGIC[2] && view[3] === OPUS_MAGIC[3];
}

/**
 * Decode an Opus-framed binary message into a Float32Array of PCM samples.
 */
export async function decodeOpus(data: ArrayBuffer, sampleRate = 16000): Promise<Float32Array> {
  const view = new DataView(data);
  const frameCount = view.getUint16(4, true);
  let offset = 6;

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

  const decoder = new AudioDecoder({
    output: (audioData: AudioData) => {
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
  for (const frame of frames) {
    const chunk = new EncodedAudioChunk({
      type: 'key',
      timestamp,
      data: frame,
    });
    decoder.decode(chunk);
    // Advance timestamp by frame duration (Opus default = 20ms = 20000µs)
    timestamp += 20000;
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

  return merged;
}
