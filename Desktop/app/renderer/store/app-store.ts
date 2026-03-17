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

  // Audio Devices
  selectedMicId: string;
  selectedMicLabel: string;
  setMicrophone: (id: string, label: string) => void;

  selectedOutputMicId: string;
  selectedOutputMicLabel: string;
  setOutputMic: (id: string, label: string) => void;

  selectedSpeakerId: string;
  selectedSpeakerLabel: string;
  setSpeaker: (id: string, label: string) => void;

  // Running state
  running: boolean;
  setRunning: (running: boolean) => void;
  toggleRunning: () => void;

  // Language
  sourceLanguage: string;
  targetLanguage: string;
  setLanguages: (source: string, target: string) => void;

  // Auto Reconnect
  autoReconnect: boolean;
  setAutoReconnect: (enabled: boolean) => void;

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
  selectedMicId: '',
  selectedMicLabel: '',
  setMicrophone: (id, label) => {
    set({ selectedMicId: id, selectedMicLabel: label });
    persistSettings({ selectedMicId: id, selectedMicLabel: label });
  },

  selectedOutputMicId: '',
  selectedOutputMicLabel: '',
  setOutputMic: (id, label) => {
    set({ selectedOutputMicId: id, selectedOutputMicLabel: label });
    persistSettings({ selectedOutputMicId: id, selectedOutputMicLabel: label });
  },

  selectedSpeakerId: '',
  selectedSpeakerLabel: '',
  setSpeaker: (id, label) => {
    set({ selectedSpeakerId: id, selectedSpeakerLabel: label });
    persistSettings({ selectedSpeakerId: id, selectedSpeakerLabel: label });
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

  // Auto Reconnect
  autoReconnect: true,
  setAutoReconnect: (enabled) => {
    set({ autoReconnect: enabled });
    persistSettings({ autoReconnect: enabled });
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
        patch.selectedMicId = settings.selectedMicId || '';
        patch.selectedMicLabel = settings.selectedMicLabel || '';
        patch.selectedOutputMicId = settings.selectedOutputMicId || '';
        patch.selectedOutputMicLabel = settings.selectedOutputMicLabel || '';
        patch.selectedSpeakerId = settings.selectedSpeakerId || '';
        patch.selectedSpeakerLabel = settings.selectedSpeakerLabel || '';
        // Use saved languages, or fallback to voice config defaults
        patch.sourceLanguage = settings.sourceLanguage || voiceConfig?.defaultSourceLanguage || '';
        patch.targetLanguage = settings.targetLanguage || voiceConfig?.defaultTargetLanguage || '';
        patch.autoReconnect = settings.autoReconnect ?? true;
      }

      set(patch as Partial<AppState>);
    } catch {
      // Settings not available (e.g. running outside Electron)
      set({ _hydrated: true });
    }
  },
}));
