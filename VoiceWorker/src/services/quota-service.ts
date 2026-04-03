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
   * Returns the ISO timestamp when the current 4-hour quota window resets.
   */
  getNextRefreshTime(): string {
    const bucketMs = 4 * 60 * 60 * 1000;
    const nextBucket = (this.getCurrentBucket() + 1) * bucketMs;
    return new Date(nextBucket).toISOString();
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
   * Get the current usage and max quota for a user in the active bucket.
   */
  async getUsage(userId: string): Promise<{ usage: number; maxQuota: number; bucket: number }> {
    const bucket = this.getCurrentBucket();
    const usageKey = `user:${userId}:usage:${bucket}`;
    const maxQuota = await this.getMaxQuota(userId);

    try {
      const usageStr = await this.redis.get(usageKey);
      const usage = usageStr ? parseInt(usageStr, 10) : 0;
      return { usage, maxQuota, bucket };
    } catch (err) {
      log.warn({ err, userId }, "Failed to read usage from Redis");
      return { usage: 0, maxQuota, bucket };
    }
  }

  /**
   * Client-safe quota info: only percentage remaining + next reset time.
   * Never exposes raw byte values to the client.
   */
  async getClientQuota(userId: string): Promise<{ remainingPercent: number; refreshesAt: string }> {
    const { usage, maxQuota } = await this.getUsage(userId);
    const remainingPercent = maxQuota > 0
      ? Math.max(Math.round(((maxQuota - usage) / maxQuota) * 100), 0)
      : 100;
    return { remainingPercent, refreshesAt: this.getNextRefreshTime() };
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
        } else if (socket.readyState === socket.OPEN) {
          // Send real-time quota updates — percentage only, no raw bytes
          const remainingPercent = maxQuota > 0
            ? Math.max(Math.round(((maxQuota - totalUsage) / maxQuota) * 100), 0)
            : 100;
          socket.send(JSON.stringify({
            type: "quota_update",
            remainingPercent,
            refreshesAt: this.getNextRefreshTime(),
            timestamp: Date.now()
          }));
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
