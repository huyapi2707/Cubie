/**
 * Typed IPC channel definitions.
 * All IPC communication MUST go through these channels.
 */

// ─── IPC Channel Names ─────────────────────────────────────────────
export const IPC_CHANNELS = {
  // Application
  APP_GET_VERSION: 'app:get-version',
  APP_GET_PLATFORM: 'app:get-platform',
  APP_QUIT: 'app:quit',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close',

  // Theme
  THEME_GET: 'theme:get',
  THEME_SET: 'theme:set',
  THEME_CHANGED: 'theme:changed',

  // File System
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',
  FS_SELECT_FILE: 'fs:select-file',
  FS_SELECT_DIRECTORY: 'fs:select-directory',

  // Settings (persisted preferences)
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // System
  SYSTEM_GET_INFO: 'system:get-info',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  SYSTEM_NOTIFICATION: 'system:notification',

  // Voice
  VOICE_GET_CONFIG: 'voice:get-config',
  VOICE_CONNECT: 'voice:connect',
  VOICE_DISCONNECT: 'voice:disconnect',
  VOICE_GET_STATUS: 'voice:get-status',
  VOICE_STATUS_CHANGED: 'voice:status-changed',
  VOICE_MESSAGE: 'voice:message',
  VOICE_AUDIO_RECEIVED: 'voice:audio-received',

  // Audio devices (main process enumeration via audify)
  AUDIO_GET_DEVICES: 'audio:get-devices',

  // Listen: stream outputMic → speaker (main process)
  LISTEN_START: 'audio:listen-start',
  LISTEN_STOP: 'audio:listen-stop',

  // Mic test: capture + denoise + level meter (main process)
  MIC_TEST_START: 'audio:mic-test-start',
  MIC_TEST_STOP: 'audio:mic-test-stop',
  MIC_TEST_LEVEL: 'audio:mic-test-level',

  // Audio playback (main process)
  AUDIO_PLAY_PCM: 'audio:play-pcm',
  SPEAKER_TEST: 'audio:speaker-test',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// ─── IPC Payload Types ─────────────────────────────────────────────

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
  hostname: string;
  totalMemory: number;
  freeMemory: number;
  uptime: number;
  cpuCount: number;
}

export interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface FileReadResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface FileWriteResult {
  success: boolean;
  error?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface VoiceConfig {
  wsUrl: string;
  authSecret: string;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  defaultSourceLanguage: string;
  defaultTargetLanguage: string;
}

export interface UserSettings {
  theme: ThemeMode;
  selectedMicId: string;
  selectedOutputMicId: string;
  selectedSpeakerId: string;
  sourceLanguage: string;
  targetLanguage: string;
  autoReconnect: boolean;
  ttsGender: 'male' | 'female' | 'neutral';
}

// ─── IPC Request/Response Maps ─────────────────────────────────────

export interface IpcInvokeMap {
  [IPC_CHANNELS.APP_GET_VERSION]: { args: void; result: string };
  [IPC_CHANNELS.APP_GET_PLATFORM]: { args: void; result: string };
  [IPC_CHANNELS.THEME_GET]: { args: void; result: ThemeMode };
  [IPC_CHANNELS.THEME_SET]: { args: ThemeMode; result: void };
  [IPC_CHANNELS.SETTINGS_GET]: { args: void; result: UserSettings };
  [IPC_CHANNELS.SETTINGS_SET]: { args: Partial<UserSettings>; result: void };
  [IPC_CHANNELS.SYSTEM_GET_INFO]: { args: void; result: SystemInfo };
  [IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL]: { args: string; result: void };
  [IPC_CHANNELS.FS_READ_FILE]: { args: string; result: FileReadResult };
  [IPC_CHANNELS.FS_WRITE_FILE]: { args: { path: string; content: string }; result: FileWriteResult };
  [IPC_CHANNELS.FS_SELECT_FILE]: { args: Record<string, unknown> | void; result: FileDialogResult };
  [IPC_CHANNELS.FS_SELECT_DIRECTORY]: { args: void; result: FileDialogResult };
  [IPC_CHANNELS.VOICE_GET_CONFIG]: { args: void; result: VoiceConfig };
}

export interface VoiceStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  errors: string[];
}

export interface VoiceAudioPayload {
  audio: number[]; // Serialised Float32Array
  sampleRate: number;
}

export interface IpcEventMap {
  [IPC_CHANNELS.THEME_CHANGED]: ThemeMode;
  [IPC_CHANNELS.SYSTEM_NOTIFICATION]: { title: string; body: string };
  [IPC_CHANNELS.VOICE_STATUS_CHANGED]: VoiceStatusPayload;
  [IPC_CHANNELS.VOICE_MESSAGE]: Record<string, unknown>;
  [IPC_CHANNELS.VOICE_AUDIO_RECEIVED]: VoiceAudioPayload;
}
