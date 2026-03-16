import { Redis } from "ioredis";
import type { SessionMetadata, SessionStore } from "../types/session.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "redis-session-store" });

const SESSION_PREFIX = "voice:session:";
const SESSION_INDEX_KEY = "voice:sessions";
const SESSION_TTL_SECONDS = 3600; // 1 hour

/**
 * Redis-backed session metadata store.
 * Enables horizontal scaling by sharing session state across instances.
 */
export class RedisSessionStore implements SessionStore {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times: number) => {
        if (times > 10) {
          log.error("Redis max retry attempts reached");
          return null;
        }
        return Math.min(times * 200, 5000);
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on("error", (err) => {
      log.error({ err }, "Redis connection error");
    });

    this.redis.on("connect", () => {
      log.info("Redis connected");
    });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async set(sessionId: string, metadata: SessionMetadata): Promise<void> {
    const key = SESSION_PREFIX + sessionId;
    const pipeline = this.redis.pipeline();

    pipeline.set(key, JSON.stringify(metadata), "EX", SESSION_TTL_SECONDS);
    pipeline.sadd(SESSION_INDEX_KEY, sessionId);

    await pipeline.exec();
  }

  async get(sessionId: string): Promise<SessionMetadata | null> {
    const key = SESSION_PREFIX + sessionId;
    const raw = await this.redis.get(key);

    if (!raw) return null;

    try {
      return JSON.parse(raw) as SessionMetadata;
    } catch {
      log.warn({ sessionId }, "Failed to parse session metadata from Redis");
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const key = SESSION_PREFIX + sessionId;
    const pipeline = this.redis.pipeline();

    pipeline.del(key);
    pipeline.srem(SESSION_INDEX_KEY, sessionId);

    await pipeline.exec();
  }

  async getAll(): Promise<string[]> {
    return this.redis.smembers(SESSION_INDEX_KEY);
  }

  async count(): Promise<number> {
    return this.redis.scard(SESSION_INDEX_KEY);
  }

  async destroy(): Promise<void> {
    await this.redis.quit();
  }
}
