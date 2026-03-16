import { v4 as uuidv4 } from "uuid";
import type WebSocket from "ws";
import type { Session, SessionMetadata, SessionStore } from "../types/session.js";
import { createChildLogger, metrics } from "../utils/index.js";
import { config } from "../config/index.js";

const log = createChildLogger({ module: "session-manager" });

/**
 * Manages the lifecycle of client sessions.
 * Each WebSocket connection gets its own isolated session with
 * independent audio buffers and language configuration.
 */
export class SessionManager {
  /** Active sessions keyed by session ID — always local to the process */
  private sessions = new Map<string, Session>();

  /** External session metadata store (memory or Redis) */
  private store: SessionStore;

  /** Heartbeat interval handle */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(store: SessionStore) {
    this.store = store;
  }

  /**
   * Start the heartbeat monitor that detects stale connections.
   */
  startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, config.WS_HEARTBEAT_INTERVAL_MS);

    log.info(
      { intervalMs: config.WS_HEARTBEAT_INTERVAL_MS },
      "Heartbeat monitor started"
    );
  }

  /**
   * Create a new session for an incoming WebSocket connection.
   */
  async createSession(ws: WebSocket, userId?: string): Promise<Session> {
    const id = uuidv4();
    const now = new Date();

    const session: Session = {
      id,
      websocket: ws,
      audioBuffer: [],
      audioBufferSize: 0,
      sourceLanguage: "en",
      targetLanguage: "en",
      isStreaming: false,
      createdAt: now,
      lastActivityAt: now,
      userId,
    };

    this.sessions.set(id, session);
    metrics.increment("sessions.created");
    metrics.gauge("sessions.active", this.sessions.size);

    // Persist metadata to the external store
    await this.store.set(id, this.toMetadata(session));

    log.info({ sessionId: id, userId }, "Session created");
    return session;
  }

  /**
   * Retrieve a session by ID.
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session language configuration.
   */
  async updateSession(
    sessionId: string,
    update: Partial<Pick<Session, "sourceLanguage" | "targetLanguage" | "isStreaming">>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    Object.assign(session, update);
    session.lastActivityAt = new Date();

    await this.store.set(sessionId, this.toMetadata(session));
  }

  /**
   * Append audio data to a session's buffer.
   * Returns false if the buffer limit would be exceeded.
   */
  appendAudio(sessionId: string, chunk: Buffer): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Enforce buffer size limits
    if (
      session.audioBufferSize + chunk.length >
      config.AUDIO_BUFFER_MAX_BYTES
    ) {
      log.warn(
        { sessionId, currentSize: session.audioBufferSize, chunkSize: chunk.length },
        "Audio buffer limit exceeded"
      );
      return false;
    }

    session.audioBuffer.push(chunk);
    session.audioBufferSize += chunk.length;
    session.lastActivityAt = new Date();

    metrics.increment("audio.chunks_received");
    metrics.increment("audio.bytes_received", chunk.length);

    return true;
  }

  /**
   * Drain and return the current audio buffer, resetting it.
   */
  drainAudioBuffer(sessionId: string): Buffer | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.audioBuffer.length === 0) return null;

    const combined = Buffer.concat(session.audioBuffer);
    session.audioBuffer = [];
    session.audioBufferSize = 0;

    return combined;
  }

  /**
   * Destroy a session and clean up resources.
   */
  async destroySession(sessionId: string, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clear audio buffer
    session.audioBuffer = [];
    session.audioBufferSize = 0;

    // Close WebSocket if still open
    if (
      session.websocket.readyState === session.websocket.OPEN ||
      session.websocket.readyState === session.websocket.CONNECTING
    ) {
      session.websocket.close(1000, reason);
    }

    this.sessions.delete(sessionId);
    await this.store.delete(sessionId);

    metrics.increment("sessions.destroyed");
    metrics.gauge("sessions.active", this.sessions.size);

    log.info({ sessionId, reason }, "Session destroyed");
  }

  /**
   * Get count of active sessions.
   */
  getActiveCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active session IDs.
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Clean up all sessions and stop the heartbeat monitor.
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      await this.destroySession(id, "server_shutdown");
    }

    await this.store.destroy();
    log.info("Session manager shut down");
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private checkHeartbeats(): void {
    const now = Date.now();
    const timeout = config.WS_HEARTBEAT_INTERVAL_MS + config.WS_HEARTBEAT_TIMEOUT_MS;

    for (const [id, session] of this.sessions) {
      const elapsed = now - session.lastActivityAt.getTime();

      if (elapsed > timeout) {
        log.warn({ sessionId: id, elapsedMs: elapsed }, "Session heartbeat timeout");
        void this.destroySession(id, "heartbeat_timeout");
      } else {
        // Send ping to keep NATs and proxies alive
        if (session.websocket.readyState === session.websocket.OPEN) {
          session.websocket.ping();
        }
      }
    }
  }

  private toMetadata(session: Session): SessionMetadata {
    return {
      id: session.id,
      sourceLanguage: session.sourceLanguage,
      targetLanguage: session.targetLanguage,
      isStreaming: session.isStreaming,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      audioBufferSize: session.audioBufferSize,
      userId: session.userId,
    };
  }
}
