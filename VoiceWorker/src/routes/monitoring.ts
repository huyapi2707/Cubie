import type { FastifyPluginAsync } from "fastify";
import { metrics } from "../utils/index.js";
import type { WorkerPool } from "../workers/index.js";
import type { SessionManager } from "../sessions/index.js";
import { authenticate, authorize } from "../middlewares/auth.js";

export interface MonitoringOptions {
  workerPool: WorkerPool;
  sessionManager: SessionManager;
}

export const monitoringRoutes: FastifyPluginAsync<MonitoringOptions> = async (app, opts) => {
  const { workerPool, sessionManager } = opts;

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
  app.get("/metrics", { preHandler: [authenticate, authorize(["ADMIN"])] }, async () => {
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
};
