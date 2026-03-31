/**
 * Error Reporter — Main Process
 *
 * Sends user-facing error messages to the renderer process via the
 * `app:error` IPC channel, where they are displayed as popup toasts.
 *
 * Import and call `reportError()` in catch blocks that represent
 * real user-visible failures (device failures, connection issues, etc.).
 */

import { BrowserWindow } from 'electron';

export function reportError(message: string, source: string): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('app:error', { message, source });
    }
  }
}
