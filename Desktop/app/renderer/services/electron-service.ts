import type { SystemInfo } from '@shared/ipc';

/**
 * System service — wraps IPC calls for system information.
 */
export const systemService = {
  async getSystemInfo(): Promise<SystemInfo | null> {
    try {
      return await window.electronAPI.system.getInfo();
    } catch (error) {
      console.error('[SystemService] Failed to get system info:', error);
      return null;
    }
  },

  async openExternal(url: string): Promise<void> {
    try {
      await window.electronAPI.system.openExternal(url);
    } catch (error) {
      console.error('[SystemService] Failed to open external URL:', error);
    }
  },
};

/**
 * File service — wraps IPC calls for file operations.
 */
export const fileService = {
  async readFile(filePath: string) {
    try {
      return await window.electronAPI.fs.readFile(filePath);
    } catch (error) {
      console.error('[FileService] Failed to read file:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  async writeFile(filePath: string, content: string) {
    try {
      return await window.electronAPI.fs.writeFile(filePath, content);
    } catch (error) {
      console.error('[FileService] Failed to write file:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  async selectFile() {
    try {
      return await window.electronAPI.fs.selectFile();
    } catch (error) {
      console.error('[FileService] Failed to select file:', error);
      return { canceled: true, filePaths: [] };
    }
  },

  async selectDirectory() {
    try {
      return await window.electronAPI.fs.selectDirectory();
    } catch (error) {
      console.error('[FileService] Failed to select directory:', error);
      return { canceled: true, filePaths: [] };
    }
  },
};
