import type { FastifyPluginAsync } from "fastify";
import { metrics } from "../utils/index.js";
import type { WorkerPool } from "../workers/index.js";
import type { SessionManager } from "../sessions/index.js";
import type { QuotaService } from "../services/index.js";
import { authenticate, authorize } from "../middlewares/auth.js";

export interface MonitoringOptions {
  workerPool: WorkerPool;
  sessionManager: SessionManager;
  quotaService: QuotaService;
}

export const monitoringRoutes: FastifyPluginAsync<MonitoringOptions> = async (app, opts) => {
  const { workerPool, sessionManager, quotaService } = opts;

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

  /** Quota usage for all active sessions */
  app.get("/quota-usage", { preHandler: [authenticate, authorize(["ADMIN"])] }, async () => {
    const sessions = sessionManager.getActiveSessions();

    // Deduplicate userIds and fetch quota for each
    const userIds = [...new Set(sessions.map((s) => s.userId).filter(Boolean))] as string[];
    const quotaMap = new Map<string, { usage: number; maxQuota: number }>();

    await Promise.all(
      userIds.map(async (userId) => {
        const data = await quotaService.getUsage(userId);
        quotaMap.set(userId, data);
      })
    );

    return {
      sessions: sessions.map((s) => ({
        ...s,
        quota: s.userId ? quotaMap.get(s.userId) ?? null : null,
      })),
    };
  });
};
