/**
 * IPC Handlers — Barrel
 *
 * Registers all IPC handlers for the main process.
 */

import { registerAppHandlers } from './app-handlers';
import { registerVoiceHandlers } from './voice-handlers';
import { registerAudioHandlers } from './audio-handlers';

export function registerIpcHandlers(): void {
  registerAppHandlers();
  registerVoiceHandlers();
  registerAudioHandlers();
}
