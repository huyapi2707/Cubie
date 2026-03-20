/**
 * Voice IPC Handlers — Main Process
 *
 * Thin wiring layer between IPC channels and the VoiceService.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import { getVoiceService } from '../services/voice-service';

export function registerVoiceHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.VOICE_CONNECT, async () => {
    await getVoiceService()?.connect();
  });

  ipcMain.handle(IPC_CHANNELS.VOICE_DISCONNECT, () => {
    getVoiceService()?.disconnect();
  });

  ipcMain.handle(IPC_CHANNELS.VOICE_GET_STATUS, () => {
    return getVoiceService()?.getStatusInfo() ?? {
      status: 'disconnected',
      sessionId: null,
      errors: [],
    };
  });

  ipcMain.handle(IPC_CHANNELS.VOICE_GET_CONFIG, () => {
    return getVoiceService()?.getConfig();
  });
}
