/** Sample rate used for microphone capture across the app (Hz). */
export const SOURCE_SAMPLE_RATE = 48000;

// ─── VAD Pipeline Constants ─────────────────────────────────────────

/** RNNoise / VAD frame size in samples (10ms @ 48kHz). */
export const FRAME_SIZE = 480;

/** RMS above this → speech detected. */
export const SPEECH_THRESHOLD = 0.01;

/** RMS below this → silence detected during speech. */
export const SILENCE_THRESHOLD = 0.005;

/** Silent frames before speech end (~300ms at 10ms/frame). */
export const HANGOVER_FRAMES = 30;

/** Pre-roll frames to keep before speech start (~100ms). */
export const PREROLL_FRAMES = 10;