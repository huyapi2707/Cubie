import { useCallback } from 'react';

/**
 * Hook for Electron IPC communication.
 * Provides typed access to the electron API bridge.
 */
export function useElectron() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const invoke = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      if (!isElectron) {
        console.warn('[useElectron] Not running in Electron environment');
        return null;
      }
      try {
        return await fn();
      } catch (error) {
        console.error('[useElectron] IPC error:', error);
        return null;
      }
    },
    [isElectron],
  );

  return {
    isElectron,
    invoke,
    api: isElectron ? window.electronAPI : null,
  };
}
