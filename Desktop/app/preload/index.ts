import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure preload bridge.
 * Exposes only whitelisted IPC channels to the renderer process.
 * NEVER expose ipcRenderer directly.
 *
 * NOTE: Channel strings are inlined here (not imported from shared/ipc)
 * because Electron's sandbox preload loader cannot resolve cross-directory
 * relative imports. The main process and renderer use the shared module;
 * the preload deliberately duplicates just the string constants.
 */

// ─── Inlined IPC Channel Constants ─────────────────────────────────
const CH = {
  APP_GET_VERSION: 'app:get-version',
  APP_GET_PLATFORM: 'app:get-platform',
  APP_QUIT: 'app:quit',
  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close',
  APP_SET_RUNNING: 'app:set-running',
  THEME_GET: 'theme:get',
  THEME_SET: 'theme:set',
  THEME_CHANGED: 'theme:changed',
  SYSTEM_GET_INFO: 'system:get-info',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',
  FS_SELECT_FILE: 'fs:select-file',
  FS_SELECT_DIRECTORY: 'fs:select-directory',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  VOICE_GET_CONFIG: 'voice:get-config',
  VOICE_CONNECT: 'voice:connect',
  VOICE_DISCONNECT: 'voice:disconnect',
  VOICE_GET_STATUS: 'voice:get-status',
  VOICE_STATUS_CHANGED: 'voice:status-changed',
  VOICE_MESSAGE: 'voice:message',
  VOICE_AUDIO_RECEIVED: 'voice:audio-received',
  AUDIO_GET_DEVICES: 'audio:get-devices',
  AUDIO_GET_LINES: 'audio:get-lines',
  LISTEN_START: 'audio:listen-start',
  LISTEN_STOP: 'audio:listen-stop',
  MIC_TEST_START: 'audio:mic-test-start',
  MIC_TEST_STOP: 'audio:mic-test-stop',
  MIC_TEST_LEVEL: 'audio:mic-test-level',
  AUDIO_PLAY_PCM: 'audio:play-pcm',
  SPEAKER_TEST: 'audio:speaker-test',
  RAW_LEVEL_START: 'audio:raw-level-start',
  RAW_LEVEL_STOP: 'audio:raw-level-stop',
  RAW_LEVEL_DATA: 'audio:raw-level-data',
} as const;

type ThemeMode = 'light' | 'dark' | 'system';

interface UserSettings {
  theme: ThemeMode;
  physicalMicId: string;
  physicalSpeakerId: string;
  forwardLineId: string;
  reverseLineId: string;
  sourceLanguage: string;
  targetLanguage: string;
  autoReconnect: boolean;
  ttsGender: 'male' | 'female' | 'neutral';
}

// ─── API Bridge ────────────────────────────────────────────────────

const electronAPI = {
  // ─── Application ─────────────────────────────────────────────
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(CH.APP_GET_VERSION),
    getPlatform: (): Promise<string> => ipcRenderer.invoke(CH.APP_GET_PLATFORM),
    quit: (): void => ipcRenderer.send(CH.APP_QUIT),
    setRunning: (running: boolean): void => ipcRenderer.send(CH.APP_SET_RUNNING, running),
  },

  // ─── Window Controls ────────────────────────────────────────
  window: {
    minimize: (): void => ipcRenderer.send(CH.APP_MINIMIZE),
    maximize: (): void => ipcRenderer.send(CH.APP_MAXIMIZE),
    close: (): void => ipcRenderer.send(CH.APP_CLOSE),
  },

  // ─── Theme ───────────────────────────────────────────────────
  theme: {
    get: (): Promise<ThemeMode> => ipcRenderer.invoke(CH.THEME_GET),
    set: (mode: ThemeMode): Promise<void> => ipcRenderer.invoke(CH.THEME_SET, mode),
    onChange: (callback: (mode: ThemeMode) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, mode: ThemeMode) => callback(mode);
      ipcRenderer.on(CH.THEME_CHANGED, handler);
      return () => ipcRenderer.removeListener(CH.THEME_CHANGED, handler);
    },
  },

  // ─── System ──────────────────────────────────────────────────
  system: {
    getInfo: () => ipcRenderer.invoke(CH.SYSTEM_GET_INFO),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(CH.SYSTEM_OPEN_EXTERNAL, url),
  },

  // ─── File System ─────────────────────────────────────────────
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke(CH.FS_READ_FILE, filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke(CH.FS_WRITE_FILE, { path: filePath, content }),
    selectFile: (options?: Record<string, unknown>) =>
      ipcRenderer.invoke(CH.FS_SELECT_FILE, options),
    selectDirectory: () => ipcRenderer.invoke(CH.FS_SELECT_DIRECTORY),
  },

  // ─── Settings ────────────────────────────────────────────────
  settings: {
    get: (): Promise<UserSettings> => ipcRenderer.invoke(CH.SETTINGS_GET),
    set: (partial: Partial<UserSettings>): Promise<void> =>
      ipcRenderer.invoke(CH.SETTINGS_SET, partial),
  },

  // ─── Voice ──────────────────────────────────────────────────
  voice: {
    getConfig: () => ipcRenderer.invoke(CH.VOICE_GET_CONFIG),
    connect: (): Promise<void> => ipcRenderer.invoke(CH.VOICE_CONNECT),
    disconnect: (): Promise<void> => ipcRenderer.invoke(CH.VOICE_DISCONNECT),
    getStatus: () => ipcRenderer.invoke(CH.VOICE_GET_STATUS),
    onStatusChanged: (callback: (payload: { status: string; errors: string[] }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { status: string; errors: string[] }) => callback(payload);
      ipcRenderer.on(CH.VOICE_STATUS_CHANGED, handler);
      return () => ipcRenderer.removeListener(CH.VOICE_STATUS_CHANGED, handler);
    },
    onMessage: (callback: (message: Record<string, unknown>) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: Record<string, unknown>) => callback(message);
      ipcRenderer.on(CH.VOICE_MESSAGE, handler);
      return () => ipcRenderer.removeListener(CH.VOICE_MESSAGE, handler);
    },
    onAudioReceived: (callback: (payload: { audio: number[]; sampleRate: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { audio: number[]; sampleRate: number }) => callback(payload);
      ipcRenderer.on(CH.VOICE_AUDIO_RECEIVED, handler);
      return () => ipcRenderer.removeListener(CH.VOICE_AUDIO_RECEIVED, handler);
    },
  },

  // ─── Audio Devices & I/O ─────────────────────────────────────
  audio: {
    getDevices: () => ipcRenderer.invoke(CH.AUDIO_GET_DEVICES),
    getLines: () => ipcRenderer.invoke(CH.AUDIO_GET_LINES),
    listenStart: (inputDeviceId: number, outputDeviceId: number): Promise<void> =>
      ipcRenderer.invoke(CH.LISTEN_START, inputDeviceId, outputDeviceId),
    listenStop: (): Promise<void> => ipcRenderer.invoke(CH.LISTEN_STOP),
    micTestStart: (micId: number, speakerId: number): Promise<void> =>
      ipcRenderer.invoke(CH.MIC_TEST_START, micId, speakerId),
    micTestStop: (): Promise<void> => ipcRenderer.invoke(CH.MIC_TEST_STOP),
    onMicTestLevel: (callback: (payload: { level: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { level: number }) => callback(payload);
      ipcRenderer.on(CH.MIC_TEST_LEVEL, handler);
      return () => ipcRenderer.removeListener(CH.MIC_TEST_LEVEL, handler);
    },
    playPcm: (audioArray: number[], sampleRate: number, outputDeviceId: number): Promise<void> =>
      ipcRenderer.invoke(CH.AUDIO_PLAY_PCM, audioArray, sampleRate, outputDeviceId),
    speakerTest: (deviceId: number): Promise<void> =>
      ipcRenderer.invoke(CH.SPEAKER_TEST, deviceId),
    rawLevelStart: (micId: number): Promise<void> =>
      ipcRenderer.invoke(CH.RAW_LEVEL_START, micId),
    rawLevelStop: (): Promise<void> =>
      ipcRenderer.invoke(CH.RAW_LEVEL_STOP),
    onRawLevelData: (callback: (payload: { db: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { db: number }) => callback(payload);
      ipcRenderer.on(CH.RAW_LEVEL_DATA, handler);
      return () => ipcRenderer.removeListener(CH.RAW_LEVEL_DATA, handler);
    },
  },
};

// Expose the API to the renderer via the contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript: augment window type for the renderer
export type ElectronAPI = typeof electronAPI;
