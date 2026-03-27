import { create } from 'zustand';
import type { ThemeMode } from '@shared/ipc';

// ─── App Store ─────────────────────────────────────────────────────

interface AppState {
  // Theme
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  /** Update local theme state without persisting — used when main process pushes a change */
  _setThemeFromMain: (theme: ThemeMode) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Navigation
  activePage: string;
  setActivePage: (page: string) => void;

  // App Info
  version: string;
  platform: string;
  setAppInfo: (info: { version: string; platform: string }) => void;

  // Audio Devices (IDs only — labels are derived from device list at render time)
  inMicId: string;
  setMicrophone: (id: string) => void;

  outMicId: string;
  setOutputMic: (id: string) => void;

  outSpeakerId: string;
  setSpeaker: (id: string) => void;

  // Running state
  running: boolean;
  setRunning: (running: boolean) => void;
  toggleRunning: () => void;

  // Language
  sourceLanguage: string;
  targetLanguage: string;
  setLanguages: (source: string, target: string) => void;

  // TTS Gender
  ttsGender: 'male' | 'female' | 'neutral';
  setTtsGender: (gender: 'male' | 'female' | 'neutral') => void;

  // Auto Reconnect
  autoReconnect: boolean;
  setAutoReconnect: (enabled: boolean) => void;

  // Noise Gate (dBFS)
  noiseGateDb: number;
  setNoiseGateDb: (db: number) => void;

  // Boost Up Rate
  boostUpRate: number;
  setBoostUpRate: (rate: number) => void;

  // Settings hydration
  _hydrated: boolean;
  _hydrate: () => Promise<void>;
}

/**
 * Persist a partial settings object to disk via the preload bridge.
 * Intentionally fire-and-forget — we don't block the UI on writes.
 */
function persistSettings(partial: Record<string, unknown>): void {
  window.electronAPI?.settings?.set(partial).catch(() => {
    // Silently ignore — settings file may be locked momentarily
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  // Theme
  theme: 'dark',
  setTheme: (theme) => {
    set({ theme });
    persistSettings({ theme });
  },
  _setThemeFromMain: (theme) => {
    set({ theme });
  },

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  // Navigation
  activePage: 'dashboard',
  setActivePage: (page) => set({ activePage: page }),

  // App Info
  version: '1.0.0',
  platform: 'unknown',
  setAppInfo: (info) => set(info),

  // Audio Devices
  inMicId: '',
  setMicrophone: (id) => {
    set({ inMicId: id });
    persistSettings({ inMicId: id });
  },

  outMicId: '',
  setOutputMic: (id) => {
    set({ outMicId: id });
    persistSettings({ outMicId: id });
  },

  outSpeakerId: '',
  setSpeaker: (id) => {
    set({ outSpeakerId: id });
    persistSettings({ outSpeakerId: id });
  },

  // Running state (in-memory only — not persisted)
  running: false,
  setRunning: (running) => {
    set({ running });
    window.electronAPI?.app?.setRunning(running);
  },
  toggleRunning: () => {
    const next = !get().running;
    set({ running: next });
    window.electronAPI?.app?.setRunning(next);
  },

  // Language
  sourceLanguage: '',
  targetLanguage: '',
  setLanguages: (source, target) => {
    set({ sourceLanguage: source, targetLanguage: target });
    persistSettings({ sourceLanguage: source, targetLanguage: target });
  },

  // TTS Gender
  ttsGender: 'neutral',
  setTtsGender: (gender) => {
    set({ ttsGender: gender });
    persistSettings({ ttsGender: gender });
  },

  // Auto Reconnect
  autoReconnect: true,
  setAutoReconnect: (enabled) => {
    set({ autoReconnect: enabled });
    persistSettings({ autoReconnect: enabled });
  },

  // Noise Gate
  noiseGateDb: -50,
  setNoiseGateDb: (db) => {
    set({ noiseGateDb: db });
    persistSettings({ noiseGateDb: db });
  },

  // Boost Up Rate
  boostUpRate: 1,
  setBoostUpRate: (rate) => {
    set({ boostUpRate: rate });
    persistSettings({ boostUpRate: rate });
  },

  // Settings hydration — called once on app startup
  _hydrated: false,
  _hydrate: async () => {
    if (get()._hydrated) return;
    try {
      const [settings, voiceConfig] = await Promise.all([
        window.electronAPI?.settings?.get(),
        window.electronAPI?.voice?.getConfig(),
      ]);

      const patch: Record<string, unknown> = {
        _hydrated: true,
      };

      if (settings) {
        patch.theme = settings.theme || 'dark';
        patch.inMicId = settings.inMicId || '';
        patch.outMicId = settings.outMicId || '';
        patch.outSpeakerId = settings.outSpeakerId || '';
        // Use saved languages, or fallback to voice config defaults
        patch.sourceLanguage = settings.sourceLanguage || voiceConfig?.defaultSourceLanguage || '';
        patch.targetLanguage = settings.targetLanguage || voiceConfig?.defaultTargetLanguage || '';
        patch.autoReconnect = settings.autoReconnect ?? true;
        patch.ttsGender = settings.ttsGender || 'neutral';
        patch.noiseGateDb = settings.noiseGateDb ?? -50;
        patch.boostUpRate = settings.boostUpRate ?? 1;
      }

      set(patch as Partial<AppState>);
    } catch {
      // Settings not available (e.g. running outside Electron)
      set({ _hydrated: true });
    }
  },
}));
