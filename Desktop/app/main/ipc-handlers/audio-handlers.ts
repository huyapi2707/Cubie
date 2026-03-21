/**
 * Audio IPC Handlers — Main Process
 *
 * Thin wiring layer for audio device enumeration, listen stream, mic test,
 * PCM playback, and speaker test.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import {
  listInputDevices,
  listOutputDevices,
  startListen,
  stopListen,
  startMicTest,
  stopMicTest,
  playPcm,
  playSpeakerTest,
} from '../services/audio-service';

export function registerAudioHandlers(): void {
  // Device enumeration
  ipcMain.handle(IPC_CHANNELS.AUDIO_GET_DEVICES, () => {
    return {
      inputs: listInputDevices(),
      outputs: listOutputDevices(),
    };
  });

  // Listen stream (outputMic → speaker) — receives numeric device IDs
  ipcMain.handle(IPC_CHANNELS.LISTEN_START, (_event, inputDeviceId: number, outputDeviceId: number) => {
    startListen(inputDeviceId, outputDeviceId);
  });

  ipcMain.handle(IPC_CHANNELS.LISTEN_STOP, () => {
    stopListen();
  });

  // Mic test (capture + denoise → level meter) — receives numeric device ID
  ipcMain.handle(IPC_CHANNELS.MIC_TEST_START, async (_event, micId: number, speakerId: number) => {
    await startMicTest(micId, speakerId, (level: number) => {
      sendToRenderer(IPC_CHANNELS.MIC_TEST_LEVEL, { level });
    });
  });

  ipcMain.handle(IPC_CHANNELS.MIC_TEST_STOP, () => {
    stopMicTest();
  });

  // PCM playback (TTS audio → output device) — receives numeric device ID
  ipcMain.handle(IPC_CHANNELS.AUDIO_PLAY_PCM, (_event, audioArray: number[], sampleRate: number, outputDeviceId: number) => {
    const pcm = new Float32Array(audioArray);
    playPcm(pcm, sampleRate, outputDeviceId);
  });

  // Speaker test (ping tone) — receives numeric device ID
  ipcMain.handle(IPC_CHANNELS.SPEAKER_TEST, (_event, deviceId: number) => {
    playSpeakerTest(deviceId);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}
