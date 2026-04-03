import type WebSocket from "ws";
import type { RawData } from "ws";
import { config } from "../config/index.js";
import { createChildLogger, metrics } from "../utils/index.js";
import { SessionManager } from "../sessions/session-manager.js";
import { AudioPipelineService } from "../services/audio-pipeline.js";
import { QuotaService } from "../services/quota-service.js";
import { isOpusEncoded, decodeOpus, encodeOpus, parseSampleRate } from "../services/opus-codec.js";
import {
  ClientMessageSchema,
  type ServerMessage,
  type TranscriptMessage,
  type TranslationMessage,
  type ErrorMessage,
  type SessionCreatedMessage,
  type PongMessage,
  type SessionEndedMessage,
} from "../types/messages.js";

const log = createChildLogger({ module: "ws-gateway" });

/**
 * WebSocket Gateway
 *
 * Handles all WebSocket connection lifecycle events and message routing.
 * Each connection is assigned an isolated session via the SessionManager.
 * Binary audio frames are immediately dispatched to the
 * AudioPipelineService for processing.
 */
export class WebSocketGateway {
  constructor(
    private sessionManager: SessionManager,
    private audioPipeline: AudioPipelineService,
    private quotaService: QuotaService
  ) {}

  /**
   * Handle a new WebSocket connection.
   * Called by the Fastify WebSocket route handler.
   */
  async handleConnection(ws: WebSocket, userId?: string): Promise<void> {
    if (!userId) {
      ws.close(1008, "User ID required");
      return;
    }

    metrics.increment("connections.total");
    metrics.increment("connections.active");

    const hasQuota = await this.quotaService.checkQuota(userId);
    if (!hasQuota) {
      ws.close(4002, "Your quota has been exceeded");
      metrics.decrement("connections.active");
      return;
    }

    let session;

    try {
      session = await this.sessionManager.createSession(ws, userId);
    } catch (err) {
      log.error({ err }, "Failed to create session");
      ws.close(1011, "Session creation failed");
      metrics.decrement("connections.active");
      return;
    }

    const sessionId = session.id;
    const sessionLog = createChildLogger({
      module: "ws-gateway",
      sessionId,
    });

    sessionLog.info("Client connected");

    // Greet the client with session info
    this.send(ws, {
      type: "session_created",
      sessionId,
      timestamp: Date.now(),
    } satisfies SessionCreatedMessage);

    // Start quota tracking for this session
    this.quotaService.startTracking(userId, sessionId, ws);

    // ─── Event Handlers ────────────────────────────────────────────────

    ws.on("message", (data: RawData, isBinary: boolean) => {
      try {
        if (isBinary) {
          this.handleBinaryMessage(sessionId, data as Buffer, sessionLog);
        } else {
          this.handleTextMessage(sessionId, data.toString(), sessionLog);
        }
      } catch (err) {
        sessionLog.error({ err }, "Error handling message");
        this.sendError(ws, "INTERNAL_ERROR", "An internal error occurred");
      }
    });

    ws.on("close", (code: number, reason: Buffer) => {
      sessionLog.info(
        { code, reason: reason.toString() },
        "Client disconnected"
      );
      this.quotaService.stopTracking(sessionId);
      void this.handleDisconnect(sessionId);
    });

    ws.on("error", (err: Error) => {
      sessionLog.error({ err }, "WebSocket error");
      metrics.increment("connections.errors");
    });

    ws.on("pong", () => {
      // Update activity timestamp on pong responses
      void this.sessionManager.updateSession(sessionId, {});
    });
  }

  /**
   * Handle JSON control messages from the client.
   */
  private handleTextMessage(
    sessionId: string,
    raw: string,
    sessionLog: ReturnType<typeof createChildLogger>
  ): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    // Parse and validate the message
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(
        session.websocket,
        "INVALID_JSON",
        "Message is not valid JSON"
      );
      return;
    }

    const validated = ClientMessageSchema.safeParse(parsed);

    if (!validated.success) {
      this.sendError(
        session.websocket,
        "INVALID_MESSAGE",
        `Invalid message: ${validated.error.issues.map((i) => i.message).join(", ")}`
      );
      return;
    }

    const message = validated.data;

    switch (message.type) {
      case "start":
        sessionLog.info(
          {
            sourceLanguage: message.sourceLanguage,
            targetLanguage: message.targetLanguage,
            ttsGender: message.ttsGender,
          },
          "Starting stream"
        );

        void this.sessionManager.updateSession(sessionId, {
          sourceLanguage: message.sourceLanguage,
          targetLanguage: message.targetLanguage,
          ttsGender: message.ttsGender ?? "neutral",
          isStreaming: true,
        });
        break;

      case "stop":
        sessionLog.info("Stopping stream");

        void this.sessionManager.updateSession(sessionId, {
          isStreaming: false,
        });

        this.send(session.websocket, {
          type: "session_ended",
          reason: "client_stop",
          timestamp: Date.now(),
        } satisfies SessionEndedMessage);
        break;

      case "ping":
        this.send(session.websocket, {
          type: "pong",
          timestamp: Date.now(),
        } satisfies PongMessage);
        break;

      case "config":
        sessionLog.info(
          {
            sourceLanguage: message.sourceLanguage,
            targetLanguage: message.targetLanguage,
            ttsGender: message.ttsGender,
          },
          "Updating config"
        );

        void this.sessionManager.updateSession(sessionId, {
          ...(message.sourceLanguage && {
            sourceLanguage: message.sourceLanguage,
          }),
          ...(message.targetLanguage && {
            targetLanguage: message.targetLanguage,
          }),
          ...(message.ttsGender && {
            ttsGender: message.ttsGender,
          }),
        });
        break;
    }
  }

  /**
   * Handle binary audio frames from the client.
   * Each frame is processed immediately through the pipeline.
   */
  private async handleBinaryMessage(
    sessionId: string,
    data: Buffer,
    _sessionLog: ReturnType<typeof createChildLogger>
  ): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    // Validate audio is expected
    if (!session.isStreaming) {
      this.sendError(
        session.websocket,
        "NOT_STREAMING",
        "Send a 'start' message before streaming audio"
      );
      return;
    }

    // Validate chunk size
    if (data.length > config.AUDIO_CHUNK_MAX_BYTES) {
      this.sendError(
        session.websocket,
        "CHUNK_TOO_LARGE",
        `Audio chunk exceeds maximum size of ${config.AUDIO_CHUNK_MAX_BYTES} bytes`
      );
      return;
    }

    // Decode Opus if the message has the OPUS magic header
    let audioBuffer: Buffer;
    let sampleRate: number | undefined;
    if (isOpusEncoded(data)) {
      sampleRate = parseSampleRate(data);
      audioBuffer = decodeOpus(data);
      _sessionLog.debug(
        { opusBytes: data.length, pcmBytes: audioBuffer.length, sampleRate },
        "Decoded Opus audio"
      );
    } else {
      audioBuffer = data;
    }



    // Process audio immediately
    const result = await this.audioPipeline.processAudio(
      sessionId,
      audioBuffer,
      session.sourceLanguage,
      session.targetLanguage,
      session.ttsGender,
      sampleRate
    );

    if (session.websocket.readyState !== session.websocket.OPEN) return;

    // Send transcript
    if (result.stt) {
      this.send(session.websocket, {
        type: "transcript",
        text: result.stt.text,
        isFinal: result.stt.isFinal,
        timestamp: Date.now(),
      } satisfies TranscriptMessage);
    }

    // Send translation
    if (result.translation) {
      this.send(session.websocket, {
        type: "translation",
        text: result.translation.text,
        sourceLanguage: result.translation.sourceLanguage,
        targetLanguage: result.translation.targetLanguage,
        timestamp: Date.now(),
      } satisfies TranslationMessage);
    }

    // Send synthesized audio as Opus-encoded binary
    if (result.tts?.audioBuffer) {
      const opusAudio = encodeOpus(result.tts.audioBuffer, result.tts.sampleRate);
      session.websocket.send(opusAudio, { binary: true });
      metrics.increment("audio.bytes_sent", opusAudio.length);
      // Increment usage counter
      this.quotaService.incrementLocalUsage(sessionId, audioBuffer.length);
    }
  }

  /**
   * Handle a client disconnect.
   */
  private async handleDisconnect(sessionId: string): Promise<void> {
    await this.sessionManager.destroySession(sessionId, "client_disconnect");

    metrics.decrement("connections.active");
    metrics.increment("connections.disconnected");
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    this.send(ws, {
      type: "error",
      code,
      message,
      timestamp: Date.now(),
    } satisfies ErrorMessage);

    metrics.increment("messages.errors");
  }
}
