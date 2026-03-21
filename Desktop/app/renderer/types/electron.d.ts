/**
 * Type declarations for the Electron API exposed via the preload script.
 * These types mirror the API shape in app/preload/index.ts.
 */

import type { ThemeMode, UserSettings, VoiceStatusPayload, VoiceAudioPayload } from '@shared/ipc';

interface AudioDeviceInfo {
  id: number;
  name: string;
  inputChannels: number;
  outputChannels: number;
  isDefaultInput: boolean;
  isDefaultOutput: boolean;
}

interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    quit: () => void;
    setRunning: (running: boolean) => void;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  theme: {
    get: () => Promise<ThemeMode>;
    set: (mode: ThemeMode) => Promise<void>;
    onChange: (callback: (mode: ThemeMode) => void) => () => void;
  };
  system: {
    getInfo: () => Promise<import('@shared/ipc').SystemInfo>;
    openExternal: (url: string) => Promise<void>;
  };
  fs: {
    readFile: (filePath: string) => Promise<import('@shared/ipc').FileReadResult>;
    writeFile: (filePath: string, content: string) => Promise<import('@shared/ipc').FileWriteResult>;
    selectFile: (options?: unknown) => Promise<import('@shared/ipc').FileDialogResult>;
    selectDirectory: () => Promise<import('@shared/ipc').FileDialogResult>;
  };
  settings: {
    get: () => Promise<UserSettings>;
    set: (partial: Partial<UserSettings>) => Promise<void>;
  };
  voice: {
    getConfig: () => Promise<import('@shared/ipc').VoiceConfig>;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    getStatus: () => Promise<{ status: string; sessionId: string | null; errors: string[] }>;
    onStatusChanged: (callback: (payload: VoiceStatusPayload) => void) => () => void;
    onMessage: (callback: (message: Record<string, unknown>) => void) => () => void;
    onAudioReceived: (callback: (payload: VoiceAudioPayload) => void) => () => void;
  };
  audio: {
    getDevices: () => Promise<{ inputs: AudioDeviceInfo[]; outputs: AudioDeviceInfo[] }>;
    listenStart: (inputDeviceId: number, outputDeviceId: number) => Promise<void>;
    listenStop: () => Promise<void>;
    micTestStart: (micId: number, speakerId: number) => Promise<void>;
    micTestStop: () => Promise<void>;
    onMicTestLevel: (callback: (payload: { level: number }) => void) => () => void;
    playPcm: (audioArray: number[], sampleRate: number, outputDeviceId: number) => Promise<void>;
    speakerTest: (deviceId: number) => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
