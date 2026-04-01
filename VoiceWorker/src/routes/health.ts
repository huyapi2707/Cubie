import type { FastifyPluginAsync } from "fastify";

export const healthRoute: FastifyPluginAsync = async (app) => {
  /** Health check endpoint */
  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));
};
