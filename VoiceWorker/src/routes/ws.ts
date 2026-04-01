import type { FastifyPluginAsync } from "fastify";
import type WebSocket from "ws";
import type { WebSocketGateway } from "../websocket/index.js";
import { authenticate } from "../middlewares/auth.js";

export interface WsOptions {
  wsGateway: WebSocketGateway;
}

export const wsRoute: FastifyPluginAsync<WsOptions> = async (app, opts) => {
  const { wsGateway } = opts;

  app.get(
    "/ws",
    { websocket: true, preHandler: [authenticate] },
    (socket: WebSocket, req) => {
      if (!req.user) {
        socket.close(4401, "Authentication failed");
        return;
      }

      void wsGateway.handleConnection(socket, req.user.userId);
    }
  );
};

