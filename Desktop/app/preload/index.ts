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
} as const;

type ThemeMode = 'light' | 'dark' | 'system';

interface UserSettings {
  theme: ThemeMode;
  selectedMicId: string;
  selectedMicLabel: string;
  selectedOutputMicId: string;
  selectedOutputMicLabel: string;
  sourceLanguage: string;
  targetLanguage: string;
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
  },
};

// Expose the API to the renderer via the contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript: augment window type for the renderer
export type ElectronAPI = typeof electronAPI;
