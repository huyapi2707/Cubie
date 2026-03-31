/**
 * App IPC Handlers — Main Process
 *
 * Handles application, window, theme, system, settings, and file system IPC.
 */

import { ipcMain, app, dialog, shell, BrowserWindow, nativeTheme } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import os from 'os';
import { IPC_CHANNELS, type SystemInfo, type ThemeMode, type UserSettings } from '../../shared/ipc';
import { getSettings, setSettings, getSetting } from '../services/settings-store';
import { reportError } from '../services/error-reporter';

export function registerAppHandlers(): void {
  // ─── Application ───────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_PLATFORM, () => {
    return process.platform;
  });

  ipcMain.on(IPC_CHANNELS.APP_MINIMIZE, () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.APP_MAXIMIZE, () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on(IPC_CHANNELS.APP_CLOSE, () => {
    BrowserWindow.getFocusedWindow()?.close();
  });

  ipcMain.on(IPC_CHANNELS.APP_QUIT, () => {
    app.quit();
  });

  // ─── Theme ─────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.THEME_GET, (): ThemeMode => {
    return getSetting('theme');
  });

  ipcMain.handle(IPC_CHANNELS.THEME_SET, (_event, mode: ThemeMode) => {
    nativeTheme.themeSource = mode;
    setSettings({ theme: mode });
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC_CHANNELS.THEME_CHANGED, mode);
    });
  });

  // ─── Settings ──────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): UserSettings => {
    return getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, partial: Partial<UserSettings>) => {
    setSettings(partial);
    if (partial.theme) {
      nativeTheme.themeSource = partial.theme;
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC_CHANNELS.THEME_CHANGED, partial.theme!);
      });
    }
  });

  // ─── System Info ───────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_INFO, (): SystemInfo => {
    return {
      platform: process.platform,
      arch: os.arch(),
      version: app.getVersion(),
      hostname: os.hostname(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      cpuCount: os.cpus().length,
    };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_EXTERNAL, async (_event, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  // ─── File System ───────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (_event, filePath: string) => {
    try {
      const data = await readFile(filePath, 'utf-8');
      return { success: true, data };
    } catch (error) {
      reportError('Failed to read file: ' + (error as Error).message, 'File System');
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, async (_event, args: { path: string; content: string }) => {
    try {
      await writeFile(args.path, args.content, 'utf-8');
      return { success: true };
    } catch (error) {
      reportError('Failed to write file: ' + (error as Error).message, 'File System');
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS_SELECT_FILE, async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(
      BrowserWindow.getFocusedWindow()!,
      options ?? {
        properties: ['openFile'],
        filters: [{ name: 'All Files', extensions: ['*'] }],
      },
    );
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  ipcMain.handle(IPC_CHANNELS.FS_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory'],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });
}
