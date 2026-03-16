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
  selectedMicLabel: string;
  selectedOutputMicId: string;
  selectedOutputMicLabel: string;
  sourceLanguage: string;
  targetLanguage: string;
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

export interface IpcEventMap {
  [IPC_CHANNELS.THEME_CHANGED]: ThemeMode;
  [IPC_CHANNELS.SYSTEM_NOTIFICATION]: { title: string; body: string };
}
