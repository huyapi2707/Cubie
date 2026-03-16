import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyWebSocket from "@fastify/websocket";
import type WebSocket from "ws";
import { config } from "../config/index.js";
import { logger, metrics } from "../utils/index.js";
import { SessionManager, MemorySessionStore, RedisSessionStore } from "../sessions/index.js";
import { WorkerPool } from "../workers/index.js";
import { AudioPipelineService } from "../services/index.js";
import { WebSocketGateway } from "../websocket/index.js";
import type { SessionStore } from "../types/session.js";

/**
 * Creates and configures the Fastify application with all plugins,
 * routes, and subsystems wired together.
 */
export async function createServer() {
  // ─── Session Store ───────────────────────────────────────────────────
  let sessionStore: SessionStore;

  if (config.REDIS_URL) {
    const redisStore = new RedisSessionStore(config.REDIS_URL);
    await redisStore.connect();
    sessionStore = redisStore;
    logger.info("Using Redis session store");
  } else {
    sessionStore = new MemorySessionStore();
    logger.info("Using in-memory session store");
  }

  // ─── Subsystems ──────────────────────────────────────────────────────
  const sessionManager = new SessionManager(sessionStore);
  const workerPool = new WorkerPool();
  const audioPipeline = new AudioPipelineService(workerPool);
  const wsGateway = new WebSocketGateway(sessionManager, audioPipeline);

  // ─── Fastify App ─────────────────────────────────────────────────────
  const app = Fastify({
    logger: false, // We use our own Pino instance
    maxParamLength: 200,
    bodyLimit: config.WS_MAX_PAYLOAD_BYTES,
  });

  // ─── Plugins ─────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });

  await app.register(fastifyWebSocket, {
    options: {
      maxPayload: config.WS_MAX_PAYLOAD_BYTES,
      perMessageDeflate: false, // Disable for low-latency audio
    },
  });

  // ─── HTTP Routes ─────────────────────────────────────────────────────

  /** Health check endpoint */
  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  /** Readiness check — confirms all subsystems are operational */
  app.get("/ready", async () => {
    const workerStatus = workerPool.getStatus();
    const isReady = workerStatus.totalWorkers > 0;

    return {
      status: isReady ? "ready" : "not_ready",
      sessions: sessionManager.getActiveCount(),
      workers: workerStatus,
    };
  });

  /** Metrics endpoint for monitoring */
  app.get("/metrics", async () => {
    const snapshot = metrics.snapshot();
    const workerStatus = workerPool.getStatus();

    return {
      ...snapshot,
      sessions: {
        active: sessionManager.getActiveCount(),
        ids: sessionManager.getActiveSessionIds(),
      },
      workers: workerStatus,
    };
  });

  // ─── WebSocket Route ─────────────────────────────────────────────────

  app.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
    const query = req.query as Record<string, string | undefined>;
    const token = query.token;

    if (!token || token !== config.AUTH_SECRET) {
      logger.warn({ ip: req.ip }, "WS connection rejected: invalid auth");
      socket.close(4401, "Authentication failed");
      metrics.increment("connections.rejected");
      return;
    }

    void wsGateway.handleConnection(socket);
  });

  // ─── Lifecycle Hooks ─────────────────────────────────────────────────

  app.addHook("onReady", async () => {
    await workerPool.initialize();
    sessionManager.startHeartbeat();
    logger.info("All subsystems initialized");
  });

  app.addHook("onClose", async () => {
    logger.info("Shutting down…");
    await sessionManager.shutdown();
    await workerPool.shutdown();
    logger.info("Shutdown complete");
  });

  return app;
}
