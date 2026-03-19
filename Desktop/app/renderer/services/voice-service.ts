import type { VoiceConfig } from '@shared/ipc';
import { useAppStore } from '@/store';
import { encodeOpus, isOpusEncoded, decodeOpus } from './opus-codec';
import { deviceService } from './device-service';
import { VoicePipeline } from './voice-pipeline';
import { SOURCE_SAMPLE_RATE, SILENCE_THRESHOLD } from '@/constants/audio';
import { calculateRms } from '@/lib/utils';

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

/**
 * Manages the WebSocket connection to the VoiceWorker server.
 *
 * Connection config is fetched from the main process via IPC
 * (single source of truth — see main/index.ts).
 *
 * Usage:
 *   voiceService.connect()      — fetches config, opens WS, sends "start"
 *   voiceService.disconnect()   — sends "stop" + closes the connection
 *   voiceService.onMessage(fn)  — subscribe to incoming messages
 *   voiceService.onStatus(fn)   — subscribe to connection status changes
 */
class VoiceService {
  private ws: WebSocket | null = null;
  private config: VoiceConfig | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string | null = null;
  private lastErrors: string[] = [];

  // Audio pipeline (48kHz: Mic → RNNoise → VAD → Opus → WS)
  private pipeline: VoicePipeline | null = null;

  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private audioHandlers: Set<AudioHandler> = new Set();

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Connect to the VoiceWorker server and begin streaming.
   * Fetches connection config from the main process on first call.
   */
  async connect(): Promise<void> {
    if (this.ws && this.status === 'connected') {
      console.warn('[VoiceService] Already connected');
      return;
    }

    // Fetch config from main process (cached after first call)
    if (!this.config) {
      try {
        this.config = await window.electronAPI.voice.getConfig();
      } catch (err) {
        console.error('[VoiceService] Failed to get voice config:', err);
        this.setStatus('error');
        return;
      }
    }

    this.reconnectAttempts = 0;
    this.clearReconnect();
    this.openConnection();
  }

  /**
   * Stop streaming and disconnect from the VoiceWorker server.
   */
  disconnect(): void {
    this.clearReconnect();
    this.stopAudioStream();
    // Prevent auto-reconnect
    this.reconnectAttempts = this.config?.maxReconnectAttempts ?? 999;

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendJSON({ type: 'stop' });
      }
      this.ws.close(1000, 'client_disconnect');
      this.ws = null;
    }

    this.sessionId = null;
    this.setStatus('disconnected');
  }

  /**
   * Subscribe to incoming server messages.
   * Returns an unsubscribe function.
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to connection status changes.
   * Returns an unsubscribe function.
   */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Subscribe to incoming audio data (decoded TTS from server).
   * Handler receives Float32Array PCM samples and the sample rate.
   * Returns an unsubscribe function.
   */
  onAudio(handler: AudioHandler): () => void {
    this.audioHandlers.add(handler);
    return () => this.audioHandlers.delete(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getErrors(): string[] {
    return this.lastErrors;
  }

  // ─── Private ────────────────────────────────────────────────────────

  private async openConnection(): Promise<void> {
    if (!this.config) return;

    // Validate user settings before connecting
    const errors = await this.validateSettings();
    if (errors.length > 0) {
      console.error('[VoiceService] Settings validation failed:', errors);
      this.lastErrors = errors;
      this.setStatus('error');
      return;
    }
    this.lastErrors = [];

    this.setStatus('connecting');

    const token = encodeURIComponent(this.config.authSecret);
    const url = `${this.config.wsUrl}?token=${token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[VoiceService] Connected');
      this.reconnectAttempts = 0;
      this.lastErrors = [];
      this.setStatus('connected');
    };

    this.ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data) as VoiceServerMessage;
          this.handleMessage(message);
        } catch (err) {
          console.error('[VoiceService] Failed to parse message:', err);
        }
      } else if (event.data instanceof Blob) {
        this.handleBinaryMessage(event.data);
      }
    };

    this.ws.onclose = (event) => {
      console.log('[VoiceService] Disconnected:', event.code, event.reason);
      this.ws = null;
      this.stopAudioStream();

      if (event.code === 4401) {
        console.error('[VoiceService] Authentication failed');
        this.lastErrors = ['Authentication failed — check your server credentials'];
        this.setStatus('error');
        return;
      }

      if (event.code !== 1000 && this.status !== 'disconnected') {
        const { autoReconnect } = useAppStore.getState();
        if (autoReconnect) {
          this.lastErrors = ['Connection to server lost — reconnecting…'];
          this.setStatus('error');
          this.scheduleReconnect();
        } else {
          this.lastErrors = ['Connection to server lost'];
          this.setStatus('error');
        }
      } else {
        this.setStatus('disconnected');
      }
    };

    this.ws.onerror = (event) => {
      console.error('[VoiceService] WebSocket error:', event);
    };
  }

  private handleMessage(message: VoiceServerMessage): void {
    switch (message.type) {
      case 'session_created':
        this.sessionId = message.sessionId as string;
        console.log('[VoiceService] Session created:', this.sessionId);

        const state = useAppStore.getState();
        this.sendJSON({
          type: 'start',
          sourceLanguage: state.sourceLanguage || this.config!.defaultSourceLanguage,
          targetLanguage: state.targetLanguage || this.config!.defaultTargetLanguage,
          ttsGender: state.ttsGender || 'neutral',
        });

        // Begin streaming audio from the selected mic
        this.startAudioStream(state.selectedMicId);
        break;

      case 'error':
        console.error('[VoiceService] Server error:', message.code, message.message);
        break;
    }

    this.messageHandlers.forEach((handler) => handler(message));
  }

  private async handleBinaryMessage(blob: Blob): Promise<void> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      if (isOpusEncoded(arrayBuffer)) {
        const { audio, sampleRate } = await decodeOpus(arrayBuffer);
        this.audioHandlers.forEach((h) => h(audio, sampleRate));
      } else {
        console.warn('[VoiceService] Received unknown binary message');
      }
    } catch (err) {
      console.error('[VoiceService] Failed to decode audio:', err);
    }
  }

  private sendJSON(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private scheduleReconnect(): void {
    if (!this.config) return;

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.warn('[VoiceService] Max reconnect attempts reached');
      this.lastErrors = ['Unable to connect to server — max reconnection attempts reached'];
      this.setStatus('error');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * this.reconnectAttempts;
    console.log(`[VoiceService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.openConnection();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Audio Pipeline (48kHz: Mic → RNNoise → VAD) ───────────────────

  private async startAudioStream(deviceId: string): Promise<void> {
    try {
      this.pipeline = new VoicePipeline({
        onSpeechStart: () => {
          console.log('[VoiceService] Speech started');
        },
        onSpeechEnd: async (audio: Float32Array) => {
          // audio is Float32Array at 48kHz — encode with Opus and send
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

          // Discard silence / too-quiet segments
          const rms = calculateRms(audio);
          if (rms < SILENCE_THRESHOLD) {
            console.log(`[VoiceService] Speech discarded (RMS: ${rms.toFixed(4)})`);
            return;
          }

          try {
            const opusData = await encodeOpus(audio);
            this.ws.send(opusData);
            console.log(
              `[VoiceService] Sent Opus utterance: ${opusData.byteLength} bytes (${(audio.length / SOURCE_SAMPLE_RATE).toFixed(2)}s)`,
            );
          } catch (err) {
            console.error('[VoiceService] Opus encoding failed, sending raw:', err);
            this.ws.send(audio.buffer);
          }
        },
      });

      await this.pipeline.start(deviceId);
      console.log('[VoiceService] Audio pipeline started (48kHz)');
    } catch (err) {
      console.error('[VoiceService] Failed to start audio pipeline:', err);
    }
  }

  private stopAudioStream(): void {
    if (this.pipeline) {
      this.pipeline.stop();
      this.pipeline = null;
    }
    console.log('[VoiceService] Audio pipeline stopped');
  }

  private async validateSettings(): Promise<string[]> {
    const state = useAppStore.getState();
    const errors: string[] = [];

    if (!state.sourceLanguage) {
      errors.push('Source language is not set');
    }
    if (!state.targetLanguage) {
      errors.push('Target language is not set');
    }

    // Check devices are selected
    if (!state.selectedMicId) {
      errors.push('Input microphone is not selected');
    }
    if (!state.selectedOutputMicId) {
      errors.push('Output microphone is not selected');
    }

    // If device IDs are set, verify they still exist on the system
    try {
      if (state.selectedMicId && !(await deviceService.deviceExists(state.selectedMicId, 'audioinput'))) {
        errors.push(`Input microphone "${state.selectedMicLabel}" is no longer available`);
      }
      if (state.selectedOutputMicId && !(await deviceService.deviceExists(state.selectedOutputMicId, 'audioinput'))) {
        errors.push(`Output microphone "${state.selectedOutputMicLabel}" is no longer available`);
      }
    } catch {
      errors.push('Unable to enumerate audio devices');
    }

    return errors;
  }
}

/** Singleton instance */
export const voiceService = new VoiceService();
