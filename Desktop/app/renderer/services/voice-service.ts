/**
 * Voice Service — Renderer Process
 *
 * Thin IPC client. The entire audio pipeline (capture, RNNoise, VAD,
 * Opus, WebSocket) lives in the main process.
 *
 * This service only:
 *   - Sends connect/disconnect commands to main
 *   - Subscribes to status, message, and audio events from main
 *   - Provides the same public API so the dashboard UI works unchanged
 */

// ─── Types ──────────────────────────────────────────────────────────

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface VoiceServerMessage {
  type: string;
  [key: string]: unknown;
}

type MessageHandler = (message: VoiceServerMessage) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type AudioHandler = (audio: Float32Array, sampleRate: number) => void;

// ─── Voice Service ──────────────────────────────────────────────────

class VoiceService {
  private status: ConnectionStatus = 'disconnected';
  private lastErrors: string[] = [];

  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private audioHandlers: Set<AudioHandler> = new Set();

  private ipcCleanups: Array<() => void> = [];

  constructor() {
    this.setupIpcListeners();
  }

  // ─── IPC Event Listeners ──────────────────────────────────────────

  private setupIpcListeners(): void {
    const unsubStatus = window.electronAPI.voice.onStatusChanged((payload) => {
      const status = payload.status as ConnectionStatus;
      this.lastErrors = payload.errors;
      this.setStatus(status);
    });
    this.ipcCleanups.push(unsubStatus);

    const unsubMessage = window.electronAPI.voice.onMessage((message) => {
      this.messageHandlers.forEach((handler) => handler(message as VoiceServerMessage));
    });
    this.ipcCleanups.push(unsubMessage);

    const unsubAudio = window.electronAPI.voice.onAudioReceived((payload) => {
      const audio = new Float32Array(payload.audio);
      this.audioHandlers.forEach((h) => h(audio, payload.sampleRate));
    });
    this.ipcCleanups.push(unsubAudio);
  }

  // ─── Public API ─────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.status === 'connected') {
      console.warn('[VoiceService] Already connected');
      return;
    }
    await window.electronAPI.voice.connect();
  }

  disconnect(): void {
    window.electronAPI.voice.disconnect();
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  onAudio(handler: AudioHandler): () => void {
    this.audioHandlers.add(handler);
    return () => this.audioHandlers.delete(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getErrors(): string[] {
    return this.lastErrors;
  }

  // ─── Private ────────────────────────────────────────────────────────

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  destroy(): void {
    this.ipcCleanups.forEach((fn) => fn());
    this.ipcCleanups = [];
  }
}

/** Singleton instance */
export const voiceService = new VoiceService();
