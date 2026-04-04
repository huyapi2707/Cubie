import { create } from 'zustand';
import type { ThemeMode } from '@shared/ipc';

// ─── App Store ─────────────────────────────────────────────────────

interface AppState {
  // Theme
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  /** Update local theme state without persisting — used when main process pushes a change */
  _setThemeFromMain: (theme: ThemeMode) => void;

  // Auth
  jwtToken: string | null;
  userInfo: any | null;
  quotaInfo: {
    remainingPercent: number;
    refreshesAt: string;
  } | null;
  planInfo: {
    name: string;
    description: string | null;
    registeredAt: string;
    expiresAt: string;
  } | null;
  setAuth: (token: string, user: any) => void;
  logout: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;



  // App Info
  version: string;
  platform: string;
  setAppInfo: (info: { version: string; platform: string }) => void;

  // Audio Devices
  physicalMicId: string;
  setPhysicalMic: (id: string) => void;

  physicalSpeakerId: string;
  setPhysicalSpeaker: (id: string) => void;

  forwardDeviceId: string;
  setForwardDevice: (id: string) => void;

  reverseDeviceId: string;
  setReverseDevice: (id: string) => void;

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

  // Auth
  jwtToken: null,
  userInfo: null,
  quotaInfo: null,
  planInfo: null,
  setAuth: (token, user) => {
    set({ jwtToken: token, userInfo: user });
    persistSettings({ jwtToken: token, userInfo: user });
  },
  logout: () => {
    set({ jwtToken: null, userInfo: null, quotaInfo: null, planInfo: null });
    persistSettings({ jwtToken: null, userInfo: null });
  },

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),



  // App Info
  version: '1.0.0',
  platform: 'unknown',
  setAppInfo: (info) => set(info),

  // Audio Devices
  physicalMicId: '',
  setPhysicalMic: (id) => {
    set({ physicalMicId: id });
    persistSettings({ physicalMicId: id });
  },

  physicalSpeakerId: '',
  setPhysicalSpeaker: (id) => {
    set({ physicalSpeakerId: id });
    persistSettings({ physicalSpeakerId: id });
  },

  forwardDeviceId: '',
  setForwardDevice: (id) => {
    set({ forwardDeviceId: id });
    persistSettings({ forwardDeviceId: id });
  },

  reverseDeviceId: '',
  setReverseDevice: (id) => {
    set({ reverseDeviceId: id });
    persistSettings({ reverseDeviceId: id });
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
        patch.physicalMicId = settings.physicalMicId || '';
        patch.physicalSpeakerId = settings.physicalSpeakerId || '';
        patch.forwardDeviceId = settings.forwardDeviceId || '';
        patch.reverseDeviceId = settings.reverseDeviceId || '';
        // Use saved languages, or fallback to voice config defaults
        patch.sourceLanguage = settings.sourceLanguage || voiceConfig?.defaultSourceLanguage || '';
        patch.targetLanguage = settings.targetLanguage || voiceConfig?.defaultTargetLanguage || '';
        patch.autoReconnect = settings.autoReconnect ?? true;
        patch.ttsGender = settings.ttsGender || 'neutral';
        patch.noiseGateDb = settings.noiseGateDb ?? -50;
        patch.boostUpRate = settings.boostUpRate ?? 1;
        patch.jwtToken = settings.jwtToken || null;
        patch.userInfo = settings.userInfo || null;
      }

      set(patch as Partial<AppState>);

      // Verify stored token is still valid
      const token = patch.jwtToken as string | null;
      if (token && voiceConfig?.httpUrl) {
        try {
          const res = await fetch(`${voiceConfig.httpUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            // Refresh userInfo and quotaInfo with latest from server
            set({ userInfo: data.user, quotaInfo: data.quota, planInfo: data.plan ?? null });
            persistSettings({ userInfo: data.user });
          } else {
            // Token expired or invalid — logout
            console.warn('[Auth] Token expired or invalid, logging out');
            set({ jwtToken: null, userInfo: null, quotaInfo: null, planInfo: null });
            persistSettings({ jwtToken: null, userInfo: null });
          }
        } catch {
          // Server unreachable — keep token, let user retry later
          console.warn('[Auth] Could not reach server to verify token');
        }
      }
    } catch {
      // Settings not available (e.g. running outside Electron)
      set({ _hydrated: true });
    }
  },
}));
