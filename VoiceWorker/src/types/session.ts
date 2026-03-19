import type WebSocket from "ws";

export interface Session {
  /** Unique session identifier */
  id: string;
  /** WebSocket connection handle */
  websocket: WebSocket;
  /** Source language code (e.g. "en") */
  sourceLanguage: string;
  /** Target language code (e.g. "ja") */
  targetLanguage: string;
  /** TTS voice gender preference */
  ttsGender: "male" | "female" | "neutral";
  /** Whether the session is actively streaming */
  isStreaming: boolean;
  /** Session creation timestamp */
  createdAt: Date;
  /** Last activity timestamp for timeout tracking */
  lastActivityAt: Date;
  /** Optional authenticated user ID */
  userId?: string;
}

export interface SessionMetadata {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  ttsGender: "male" | "female" | "neutral";
  isStreaming: boolean;
  createdAt: string;
  lastActivityAt: string;
  userId?: string;
}

export interface SessionStore {
  /** Create or update session metadata in the store */
  set(sessionId: string, metadata: SessionMetadata): Promise<void>;
  /** Retrieve session metadata from the store */
  get(sessionId: string): Promise<SessionMetadata | null>;
  /** Remove session metadata from the store */
  delete(sessionId: string): Promise<void>;
  /** Get all active session IDs */
  getAll(): Promise<string[]>;
  /** Get the total number of active sessions */
  count(): Promise<number>;
  /** Cleanup / disconnect from the store */
  destroy(): Promise<void>;
}
