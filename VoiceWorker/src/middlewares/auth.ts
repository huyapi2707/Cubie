import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { Redis } from "ioredis";
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

// Lazy-initialized Redis client for session lookups
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL);
  }
  return redis;
}

/**
 * Parses the adminjs session cookie from raw headers and looks up
 * the session data directly in Redis. This is needed because AdminJS
 * encapsulates @fastify/session in its own plugin scope, making
 * req.session unavailable on API routes.
 */
async function getAdminSession(req: FastifyRequest): Promise<{ email: string } | null> {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    // Parse "adminjs" cookie value from the header
    const match = cookieHeader.match(/(?:^|;\s*)adminjs=([^;]+)/);
    if (!match) return null;

    const rawCookie = decodeURIComponent(match[1]);

    // The cookie is signed by @fastify/cookie (format: "sessionId.signature")
    // Strip the signature to get the plain session ID
    const dotIndex = rawCookie.indexOf(".");
    const sessionId = dotIndex !== -1 ? rawCookie.substring(0, dotIndex) : rawCookie;
    const redisKey = `adminjs:sess:${sessionId}`;

    const raw = await getRedis().get(redisKey);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (session?.adminUser?.email) {
      return { email: session.adminUser.email };
    }
    return null;
  } catch (err) {
    logger.warn({ err }, "Failed to look up AdminJS session from Redis");
    return null;
  }
}

/**
 * Validates the JWT in the Authorization header.
 * Falls back to AdminJS session cookie if no JWT is present.
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
      // Fallback: look up AdminJS session from Redis via cookie
      const adminSession = await getAdminSession(req);
      if (adminSession) {
        logger.info({ adminUser: adminSession }, "AdminJS session found");
        req.user = {
          userId: "admin-session",
          email: adminSession.email,
          role: "ADMIN",
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
