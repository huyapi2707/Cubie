import Store from 'electron-store';
import type { UserSettings, ThemeMode } from '../../shared/ipc';

// ─── Schema & Defaults ─────────────────────────────────────────────

const DEFAULTS: UserSettings = {
  theme: 'dark',
  selectedMicId: '',
  selectedOutputMicId: '',
  selectedSpeakerId: '',
  sourceLanguage: 'en',
  targetLanguage: 'vi',
  autoReconnect: true,
  ttsGender: 'neutral',
};

const schema = {
  theme: { type: 'string' as const, enum: ['light', 'dark', 'system'], default: DEFAULTS.theme },
  selectedMicId: { type: 'string' as const, default: '' },
  selectedOutputMicId: { type: 'string' as const, default: '' },
  selectedSpeakerId: { type: 'string' as const, default: '' },
  sourceLanguage: { type: 'string' as const, default: 'en' },
  targetLanguage: { type: 'string' as const, default: 'vi' },
  autoReconnect: { type: 'boolean' as const, default: true },
  ttsGender: { type: 'string' as const, enum: ['male', 'female', 'neutral'], default: 'neutral' },
};

// ─── Singleton Instance ────────────────────────────────────────────

const store = new Store<UserSettings>({
  name: 'user-settings',
  schema,
  defaults: DEFAULTS,
});

// ─── Public API ────────────────────────────────────────────────────

export function getSettings(): UserSettings {
  return {
    theme: store.get('theme') as ThemeMode,
    selectedMicId: store.get('selectedMicId'),
    selectedOutputMicId: store.get('selectedOutputMicId'),
    selectedSpeakerId: store.get('selectedSpeakerId'),
    sourceLanguage: store.get('sourceLanguage'),
    targetLanguage: store.get('targetLanguage'),
    autoReconnect: store.get('autoReconnect'),
    ttsGender: store.get('ttsGender') as 'male' | 'female' | 'neutral',
  };
}

export function setSettings(partial: Partial<UserSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    if (key in DEFAULTS && value !== undefined) {
      store.set(key as keyof UserSettings, value);
    }
  }
}

export function getSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
  return store.get(key) as UserSettings[K];
}
