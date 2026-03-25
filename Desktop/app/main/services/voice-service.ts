/**
 * Voice Service — Main Process
 *
 * Owns the entire voice pipeline:
 *   1. Audio capture + RNNoise + VAD  (AudioPipeline)
 *   2. Opus encoding/decoding         (opus-codec)
 *   3. WebSocket to VoiceWorker       (ws)
 *
 * Pure service — no IPC registration. IPC is wired in ipc-handlers/.
 */

import WebSocket from 'ws';
import { BrowserWindow } from 'electron';
import { encodeOpus, decodeOpus, isOpusEncoded } from './opus-codec';
import { AudioPipeline } from './audio-pipeline';
import { playPcm } from './audio-service';
import { SAMPLE_RATE } from './constants';
import { getSettings } from './settings-store';
import type { VoiceConfig } from '../../shared/ipc';
import { IPC_CHANNELS } from '../../shared/ipc';
import { calculateRms } from './utils';

export const SILENCE_THRESHOLD = 0.005;

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ─── Voice Service ──────────────────────────────────────────────────────────

export class MainVoiceService {
  private ws: WebSocket | null = null;
  private config: VoiceConfig;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string | null = null;
  private lastErrors: string[] = [];

  // Audio pipeline (Mic → RNNoise → VAD)
  private pipeline: AudioPipeline | null = null;

  constructor(config: VoiceConfig) {
    this.config = config;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  getConfig(): VoiceConfig {
    return this.config;
  }

  getStatusInfo(): { status: ConnectionStatus; sessionId: string | null; errors: string[] } {
    return {
      status: this.status,
      sessionId: this.sessionId,
      errors: this.lastErrors,
    };
  }

  async connect(): Promise<void> {
    if (this.ws && this.status === 'connected') {
      console.log('[VoiceService] Already connected');
      return;
    }

    const errors = this.validateSettings();
    if (errors.length > 0) {
      console.error('[VoiceService] Settings validation failed:', errors);
      this.lastErrors = errors;
      this.setStatus('error');
      return;
    }
    this.lastErrors = [];

    this.reconnectAttempts = 0;
    this.clearReconnect();
    this.openConnection();
  }

  disconnect(): void {
    this.clearReconnect();
    this.stopAudioPipeline();
    this.reconnectAttempts = this.config.maxReconnectAttempts;

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

  // ─── WebSocket ──────────────────────────────────────────────────────────

  private openConnection(): void {
    this.setStatus('connecting');

    const token = encodeURIComponent(this.config.authSecret);
    const url = `${this.config.wsUrl}?token=${token}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[VoiceService] Connected');
      this.reconnectAttempts = 0;
      this.lastErrors = [];
      this.setStatus('connected');
    });

    this.ws.on('message', (data: WebSocket.Data, isBinary: boolean) => {
      if (isBinary) {
        this.handleBinaryMessage(data as Buffer);
      } else {
        this.handleTextMessage(data.toString());
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      console.log('[VoiceService] Disconnected:', code, reason.toString());
      this.ws = null;
      this.stopAudioPipeline();

      if (code === 4401) {
        this.lastErrors = ['Authentication failed — check your server credentials'];
        this.setStatus('error');
        return;
      }

      if (code !== 1000 && this.status !== 'disconnected') {
        const settings = getSettings();
        if (settings.autoReconnect) {
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
    });

    this.ws.on('error', (err) => {
      console.error('[VoiceService] WebSocket error:', err.message);
    });
  }

  private handleTextMessage(raw: string): void {
    try {
      const message = JSON.parse(raw);

      switch (message.type) {
        case 'session_created': {
          this.sessionId = message.sessionId as string;
          console.log('[VoiceService] Session created:', this.sessionId);

          const settings = getSettings();
          this.sendJSON({
            type: 'start',
            sourceLanguage: settings.sourceLanguage || this.config.defaultSourceLanguage,
            targetLanguage: settings.targetLanguage || this.config.defaultTargetLanguage,
            ttsGender: settings.ttsGender || 'neutral',
          });

          this.startAudioPipeline();
          break;
        }

        case 'error':
          console.error('[VoiceService] Server error:', message.code, message.message);
          break;
      }

      // Forward all JSON messages to renderer
      this.sendToRenderer(IPC_CHANNELS.VOICE_MESSAGE, message);
    } catch (err) {
      console.error('[VoiceService] Failed to parse message:', err);
    }
  }

  private handleBinaryMessage(data: Buffer): void {
    try {
      if (isOpusEncoded(data)) {
        const { audio, sampleRate } = decodeOpus(data);

        // Play TTS audio directly in main process — no renderer round-trip
        const settings = getSettings();
        const outputDeviceId = Number(settings.outMicId) || 0;
        playPcm(audio, sampleRate, outputDeviceId);
      } else {
        console.warn('[VoiceService] Received unknown binary message');
      }
    } catch (err) {
      console.error('[VoiceService] Failed to decode/play audio:', err);
    }
  }

  // ─── Audio Pipeline ─────────────────────────────────────────────────────

  private async startAudioPipeline(): Promise<void> {
    const settings = getSettings();
    const deviceId = Number(settings.inMicId) || 0;

    try {
      this.pipeline = new AudioPipeline({
        onSpeechStart: () => {
        },
        onSpeechEnd: (audio: Float32Array) => {
          this.handleSpeechSegment(audio);
        },
      });

      await this.pipeline.start(deviceId);
      console.log('[VoiceService] Audio pipeline started');
    } catch (err) {
      console.error('[VoiceService] Failed to start audio pipeline:', err);
    }
  }

  private stopAudioPipeline(): void {
    if (this.pipeline) {
      this.pipeline.stop();
      this.pipeline = null;
    }
  }

  private handleSpeechSegment(audio: Float32Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // calculateRms returns normalized [0, 1] — matches SILENCE_THRESHOLD scale
    const rms = calculateRms(audio);
    if (rms < SILENCE_THRESHOLD) {
      console.log(`[VoiceService] Speech discarded (RMS: ${rms.toFixed(4)})`);
      return;
    }

    try {
      // Audio is already in Int16 range — encodeOpus accepts it directly
      const opusData = encodeOpus(audio, SAMPLE_RATE);
      this.ws.send(opusData);
      console.log(
        `[VoiceService] Sent Opus: ${opusData.byteLength} bytes (${(audio.length / SAMPLE_RATE).toFixed(2)}s)`,
      );
    } catch (err) {
      console.error('[VoiceService] Opus encoding failed:', err);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private sendJSON(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.sendToRenderer(IPC_CHANNELS.VOICE_STATUS_CHANGED, {
      status,
      errors: this.lastErrors,
    });
  }

  private sendToRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
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

  private validateSettings(): string[] {
    const settings = getSettings();
    const errors: string[] = [];

    if (!settings.sourceLanguage) errors.push('Source language is not set');
    if (!settings.targetLanguage) errors.push('Target language is not set');
    if (!settings.inMicId) errors.push('Input microphone is not selected');
    if (!settings.outMicId) errors.push('Output microphone is not selected');

    return errors;
  }
}


// ─── Factory ────────────────────────────────────────────────────────────────

let instance: MainVoiceService | null = null;

export function createVoiceService(config: VoiceConfig): MainVoiceService {
  if (!instance) {
    instance = new MainVoiceService(config);
  }
  return instance;
}

export function getVoiceService(): MainVoiceService | null {
  return instance;
}
