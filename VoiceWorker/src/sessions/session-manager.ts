import { v4 as uuidv4 } from "uuid";
import type WebSocket from "ws";
import type { Session, SessionMetadata, SessionStore } from "../types/session.js";
import { createChildLogger, metrics } from "../utils/index.js";
import { config } from "../config/index.js";

const log = createChildLogger({ module: "session-manager" });

/**
 * Manages the lifecycle of client sessions.
 * Each WebSocket connection gets its own isolated session
 * with language configuration and streaming state.
 */
export class SessionManager {
  /** Active sessions keyed by session ID */
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
      sourceLanguage: "en",
      targetLanguage: "en",
      ttsGender: "neutral",
      isStreaming: false,
      createdAt: now,
      lastActivityAt: now,
      userId,
    };

    this.sessions.set(id, session);
    metrics.increment("sessions.created");
    metrics.gauge("sessions.active", this.sessions.size);

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
   * Update session configuration.
   */
  async updateSession(
    sessionId: string,
    update: Partial<Pick<Session, "sourceLanguage" | "targetLanguage" | "ttsGender" | "isStreaming">>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    Object.assign(session, update);
    session.lastActivityAt = new Date();

    await this.store.set(sessionId, this.toMetadata(session));
  }

  /**
   * Destroy a session and clean up resources.
   */
  async destroySession(sessionId: string, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

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
      ttsGender: session.ttsGender,
      isStreaming: session.isStreaming,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      userId: session.userId,
    };
  }
}
