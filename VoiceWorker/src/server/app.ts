import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyWebSocket from "@fastify/websocket";
import { config } from "../config/index.js";
import { logger } from "../utils/index.js";
import { SessionManager, MemorySessionStore, RedisSessionStore } from "../sessions/index.js";
import { WorkerPool } from "../workers/index.js";
import { healthRoute, monitoringRoutes, wsRoute, userRoutes, authRoutes } from "../routes/index.js";
import { AudioPipelineService, QuotaService, UserService } from "../services/index.js";
import { WebSocketGateway } from "../websocket/index.js";
import prismaPlugin from "../plugins/prisma.js";
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

  // ─── Fastify App ─────────────────────────────────────────────────────
  const app = Fastify({
    logger: false, // We use our own Pino instance
    maxParamLength: 200,
    bodyLimit: config.WS_MAX_PAYLOAD_BYTES,
  });

  // ─── Plugins ─────────────────────────────────────────────────────────
  await app.register(prismaPlugin);

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

  // ─── Subsystems ──────────────────────────────────────────────────────
  const sessionManager = new SessionManager(sessionStore);
  const workerPool = new WorkerPool();
  const audioPipeline = new AudioPipelineService(workerPool);
  const userService = new UserService(app.prisma);
  const quotaService = new QuotaService(config.REDIS_URL, userService);
  const wsGateway = new WebSocketGateway(sessionManager, audioPipeline, quotaService);

  // ─── HTTP & WebSocket Routes ─────────────────────────────────────────

  await app.register(healthRoute);
  await app.register(monitoringRoutes, { workerPool, sessionManager });
  await app.register(wsRoute, { wsGateway });
  await app.register(userRoutes, { userService });
  await app.register(authRoutes, { userService });

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
