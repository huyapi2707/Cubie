import Store from 'electron-store';
import type { UserSettings, ThemeMode } from '../../shared/ipc';

// ─── Schema & Defaults ─────────────────────────────────────────────

const DEFAULTS: UserSettings = {
  theme: 'light',
  inMicId: '',
  outMicId: '',
  outSpeakerId: '',
  sourceLanguage: 'en',
  targetLanguage: 'vi',
  autoReconnect: true,
  ttsGender: 'neutral',
  noiseGateDb: -50,
  boostUpRate: 1,
};

const schema = {
  theme: { type: 'string' as const, enum: ['light', 'dark', 'system'], default: DEFAULTS.theme },
  inMicId: { type: 'string' as const, default: '' },
  outMicId: { type: 'string' as const, default: '' },
  outSpeakerId: { type: 'string' as const, default: '' },
  sourceLanguage: { type: 'string' as const, default: 'en' },
  targetLanguage: { type: 'string' as const, default: 'vi' },
  autoReconnect: { type: 'boolean' as const, default: true },
  ttsGender: { type: 'string' as const, enum: ['male', 'female', 'neutral'], default: 'neutral' },
  noiseGateDb: { type: 'number' as const, minimum: -100, maximum: 0, default: -50 },
  boostUpRate: { type: 'number' as const, minimum: 1, maximum: 100, default: 1 },
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
    inMicId: store.get('inMicId'),
    outMicId: store.get('outMicId'),
    outSpeakerId: store.get('outSpeakerId'),
    sourceLanguage: store.get('sourceLanguage'),
    targetLanguage: store.get('targetLanguage'),
    autoReconnect: store.get('autoReconnect'),
    ttsGender: store.get('ttsGender') as 'male' | 'female' | 'neutral',
    noiseGateDb: store.get('noiseGateDb'),
    boostUpRate: store.get('boostUpRate'),
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
