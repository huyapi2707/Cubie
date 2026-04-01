import { Redis } from 'ioredis';
import type { UserService } from './user-service.js';
import type WebSocket from 'ws';
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "quota-service" });

export class QuotaService {
  private redis: Redis;
  private intervals = new Map<string, NodeJS.Timeout>();
  private localUsage = new Map<string, number>();

  constructor(
    redisUrl: string,
    private userService: UserService
  ) {
    this.redis = new Redis(redisUrl);
  }

  /**
   * Gets the maximum quota for a user, using Redis cache or Prisma fallback.
   */
  async getMaxQuota(userId: string): Promise<number> {
    const cacheKey = `user:${userId}:max_quota`;
    try {
      const cached = await this.redis.get(cacheKey);

      if (cached !== null) {
        return parseInt(cached, 10);
      }
    } catch (err) {
      log.warn({ err, userId }, "Failed to get max quota from Redis cache");
    }

    // Fallback to UserService
    const maxQuota = await this.userService.getUserMaxQuota(userId);
    await this.redis.set(cacheKey, maxQuota, 'EX', 3600);
    return maxQuota;
  }

  /**
   * Returns the bucket identifier for the current 4-hour window.
   */
  private getCurrentBucket(): number {
    return Math.floor(Date.now() / (4 * 60 * 60 * 1000));
  }

  /**
   * Check if a user currently has quota available.
   */
  async checkQuota(userId: string): Promise<boolean> {
    const maxQuota = await this.getMaxQuota(userId);
    const bucket = this.getCurrentBucket();
    const usageKey = `user:${userId}:usage:${bucket}`;
    
    try {
      const usageStr = await this.redis.get(usageKey);
      const totalUsage = usageStr ? parseInt(usageStr, 10) : 0;
      return totalUsage < maxQuota;
    } catch (err) {
       log.warn({ err, userId }, "Failed to read current usage from Redis");
       return false; // Fail safe
    }
  }

  /**
   * Increment local in-memory counter for a connection.
   */
  incrementLocalUsage(sessionId: string, value: number): void {
    const current = this.localUsage.get(sessionId) || 0;
    this.localUsage.set(sessionId, current + value);
  }

  /**
   * Start tracking quota during an active sliding window stream.
   */
  startTracking(userId: string, sessionId: string, socket: WebSocket): void {
    if (this.intervals.has(sessionId)) return;

    this.localUsage.set(sessionId, 0);

    const interval = setInterval(async () => {
      try {
        const usage = this.localUsage.get(sessionId) || 0;
        this.localUsage.set(sessionId, 0);

        const bucket = this.getCurrentBucket();
        const usageKey = `user:${userId}:usage:${bucket}`;
        const maxQuotaKey = `user:${userId}:max_quota`;

        let totalUsage = 0;

        if (usage > 0) {
          const exists = await this.redis.exists(usageKey);
          totalUsage = await this.redis.incrby(usageKey, usage);
          if (!exists) {
             // If newly created, set expiration to 4 hours automatically
             await this.redis.expire(usageKey, 14400); 
          }
        } else {
          const current = await this.redis.get(usageKey);
          totalUsage = current ? parseInt(current, 10) : 0;
        }

        // Refresh max limit TTL so cache stays active during stream
        await this.redis.expire(maxQuotaKey, 3600);

        const maxQuota = await this.getMaxQuota(userId);

        if (totalUsage >= maxQuota) {
          log.warn({ userId, totalUsage, maxQuota }, "Quota exceeded during stream");
          if (socket.readyState === socket.OPEN) {
            socket.close(4002, "4-Hour Quota Exceeded");
          }
          this.stopTracking(sessionId);
        }

      } catch (err) {
        log.error({ err, userId }, "Error during quota interval sync");
      }
    }, 5000);

    this.intervals.set(sessionId, interval);
  }

  /**
   * Clear all interval timers for a session on disconnect.
   */
  stopTracking(sessionId: string): void {
    const interval = this.intervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(sessionId);
    }
    this.localUsage.delete(sessionId);
  }
}
