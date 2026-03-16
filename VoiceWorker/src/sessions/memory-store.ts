import type { SessionMetadata, SessionStore } from "../types/session.js";

/**
 * In-memory session metadata store.
 * Suitable for single-instance deployments or development.
 */
export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionMetadata>();

  async set(sessionId: string, metadata: SessionMetadata): Promise<void> {
    this.sessions.set(sessionId, metadata);
  }

  async get(sessionId: string): Promise<SessionMetadata | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getAll(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  async count(): Promise<number> {
    return this.sessions.size;
  }

  async destroy(): Promise<void> {
    this.sessions.clear();
  }
}
