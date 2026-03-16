import Store from 'electron-store';
import type { UserSettings, ThemeMode } from '../shared/ipc';

// ─── Schema & Defaults ─────────────────────────────────────────────

const DEFAULTS: UserSettings = {
  theme: 'dark',
  selectedMicId: '',
  selectedMicLabel: '',
  selectedOutputMicId: '',
  selectedOutputMicLabel: '',
};

const schema = {
  theme: { type: 'string' as const, enum: ['light', 'dark', 'system'], default: DEFAULTS.theme },
  selectedMicId: { type: 'string' as const, default: '' },
  selectedMicLabel: { type: 'string' as const, default: '' },
  selectedOutputMicId: { type: 'string' as const, default: '' },
  selectedOutputMicLabel: { type: 'string' as const, default: '' },
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
    selectedMicLabel: store.get('selectedMicLabel'),
    selectedOutputMicId: store.get('selectedOutputMicId'),
    selectedOutputMicLabel: store.get('selectedOutputMicLabel'),
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
