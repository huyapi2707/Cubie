import { config } from "./config/index.js";
import { logger } from "./utils/index.js";
import { createServer } from "./server/index.js";

async function main(): Promise<void> {
  logger.info(
    {
      host: config.HOST,
      port: config.PORT,
      env: config.NODE_ENV,
      workerPoolSize: config.WORKER_POOL_SIZE,
    },
    "Starting Voice Worker server"
  );

  const app = await createServer();

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    logger.info(`🚀 Voice Worker listening on http://${config.HOST}:${config.PORT}`);
    logger.info(`   WebSocket endpoint: ws://${config.HOST}:${config.PORT}/ws`);
    logger.info(`   Health check:       http://${config.HOST}:${config.PORT}/health`);
    logger.info(`   Metrics:            http://${config.HOST}:${config.PORT}/metrics`);
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }

  // ─── Graceful Shutdown ─────────────────────────────────────────────

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");

    try {
      await app.close();
      logger.info("Server closed gracefully");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection");
    process.exit(1);
  });
}

void main();
