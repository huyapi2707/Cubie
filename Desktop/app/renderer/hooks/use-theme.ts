import { useCallback, useEffect } from 'react';
import { useAppStore } from '@/store';
import type { ThemeMode } from '@shared/ipc';

/**
 * Hook to manage theme with Electron IPC integration.
 * Syncs theme state between the renderer store and the main process.
 * Persistence is handled by the app store via settings IPC.
 */
export function useTheme() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(prefersDark ? 'dark' : 'light');
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // Listen for theme changes from main process
  useEffect(() => {
    if (!window.electronAPI?.theme) return;

    const unsubscribe = window.electronAPI.theme.onChange((mode: ThemeMode) => {
      setTheme(mode);
    });

    return unsubscribe;
  }, [setTheme]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    // Also update nativeTheme in the main process
    window.electronAPI?.theme?.set(next);
  }, [theme, setTheme]);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setTheme(mode);
      // Also update nativeTheme in the main process
      window.electronAPI?.theme?.set(mode);
    },
    [setTheme],
  );

  return { theme, toggleTheme, setThemeMode };
}
