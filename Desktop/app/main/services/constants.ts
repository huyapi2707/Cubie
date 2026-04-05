import { RtAudioFormat } from 'audify';

// ─── Audio Constants ────────────────────────────────────────────────────────
// Single source of truth for sample rate, frame size, and audio format
// shared across audio-pipeline, audio-service, and voice-service.

/** Capture sample rate (Hz). */
export const SAMPLE_RATE = 48000;

/** TTS playback sample rate (Hz) — must match the server's TTS output rate. */
export const OUTPUT_SAMPLE_RATE = 24000;

/** Frame size in samples — 10ms @ 48kHz (RNNoise native frame size). */
export const FRAME_SIZE = 480;

/** Audio format for all RtAudio streams. */
export const AUDIO_FORMAT = RtAudioFormat.RTAUDIO_SINT16;

/** Number of input channels for mic capture. */
export const MIC_CHANNELS = 1;
