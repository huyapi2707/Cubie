import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import type { Role } from "@prisma/client";
import { logger } from "../utils/logger.js";

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

// Extend FastifyRequest globally to include our parsed user data
declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Validates the JWT in the Authorization header.
 * Should be used as a preHandler hook.
 */
export const authenticate = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else {
      const query = req.query as Record<string, string | undefined>;
      token = query?.token;
    }

    if (!token) {
      // Fallback: Check if an AdminJS session is active
      if ((req as any).session && (req as any).session.adminUser) {
        logger.info(`AdminJS session found: ${(req as any).session}`);
        req.user = { 
          userId: "admin-session", 
          email: (req as any).session.adminUser.email, 
          role: "ADMIN" 
        };
        return;
      }
      return reply.status(401).send({ error: "Missing or invalid authorization" });
    }

    const decoded = jwt.verify(token, config.AUTH_SECRET) as JwtPayload;
    
    req.user = decoded;
  } catch {
    return reply.status(401).send({ error: "Unauthorized or token expired" });
  }
};

/**
 * Generates an authorization middleware for the specified roles.
 * Must be executed AFTER `authenticate` in the preHandler array.
 */
export const authorize = (roles: Role[]) => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    if (!roles.includes(req.user.role)) {
      return reply.status(403).send({ error: "Forbidden: insufficient permissions" });
    }
  };
};
