import { Redis } from 'ioredis';
import type { UserService } from './user-service.js';
import type WebSocket from 'ws';
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "quota-service" });

const BUCKET_MS = 4 * 60 * 60 * 1000;   // 4 hours
const BUCKET_TTL = 14400;                // 4 hours in seconds
const MAX_QUOTA_TTL = 3600;              // 1 hour cache

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
   * Gets the maximum quota for a user, using Redis cache or DB fallback.
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

    const maxQuota = await this.userService.getUserMaxQuota(userId);
    try {
      await this.redis.set(cacheKey, maxQuota, 'EX', MAX_QUOTA_TTL);
    } catch (err) {
      log.warn({ err, userId }, "Failed to cache max quota in Redis");
    }
    return maxQuota;
  }

  // ─── Per-User Sliding Bucket ────────────────────────────────────────────────

  /**
   * Get the start timestamp of the user's active quota bucket.
   * Returns null if no active bucket (user was idle / bucket expired).
   */
  private async getActiveBucketStart(userId: string): Promise<number | null> {
    const startKey = `user:${userId}:bucket_start`;
    try {
      const cached = await this.redis.get(startKey);
      return cached !== null ? parseInt(cached, 10) : null;
    } catch (err) {
      log.warn({ err, userId }, "Failed to read bucket start from Redis");
      return null;
    }
  }

  /**
   * Get or create the user's active quota bucket.
   * If no bucket exists (user was idle), a new 4-hour window starts from now.
   */
  private async getOrCreateBucket(userId: string): Promise<{ usageKey: string; bucketStart: number }> {
    const existing = await this.getActiveBucketStart(userId);
    if (existing !== null) {
      return { usageKey: `user:${userId}:usage:${existing}`, bucketStart: existing };
    }

    const bucketStart = Date.now();
    await this.redis.set(`user:${userId}:bucket_start`, bucketStart, 'EX', BUCKET_TTL);
    return { usageKey: `user:${userId}:usage:${bucketStart}`, bucketStart };
  }

  /**
   * Returns the ISO timestamp when the user's current quota window resets.
   * If no active bucket, returns now + 4h (hypothetical next reset).
   */
  async getNextRefreshTime(userId: string): Promise<string> {
    const bucketStart = await this.getActiveBucketStart(userId);
    const start = bucketStart ?? Date.now();
    return new Date(start + BUCKET_MS).toISOString();
  }

  // ─── Quota Helpers ──────────────────────────────────────────────────────────

  /**
   * Compute remaining percentage from usage/max values.
   */
  private computeRemainingPercent(usage: number, maxQuota: number): number {
    if (maxQuota <= 0) return 100;
    return Math.max(Math.round(((maxQuota - usage) / maxQuota) * 100), 0);
  }

  /**
   * Check if a user currently has quota available.
   */
  async checkQuota(userId: string): Promise<boolean> {
    const bucketStart = await this.getActiveBucketStart(userId);

    // No active bucket → no usage → quota available
    if (bucketStart === null) return true;

    const maxQuota = await this.getMaxQuota(userId);
    const usageKey = `user:${userId}:usage:${bucketStart}`;

    try {
      const usageStr = await this.redis.get(usageKey);
      const totalUsage = usageStr ? parseInt(usageStr, 10) : 0;
      return totalUsage < maxQuota;
    } catch (err) {
      log.warn({ err, userId }, "Failed to read current usage from Redis");
      return false;
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
  async getUsage(userId: string): Promise<{ usage: number; maxQuota: number }> {
    const maxQuota = await this.getMaxQuota(userId);
    const bucketStart = await this.getActiveBucketStart(userId);

    if (bucketStart === null) {
      return { usage: 0, maxQuota };
    }

    const usageKey = `user:${userId}:usage:${bucketStart}`;
    try {
      const usageStr = await this.redis.get(usageKey);
      const usage = usageStr ? parseInt(usageStr, 10) : 0;
      return { usage, maxQuota };
    } catch (err) {
      log.warn({ err, userId }, "Failed to read usage from Redis");
      return { usage: 0, maxQuota };
    }
  }

  /**
   * Client-safe quota info: only percentage remaining + next reset time.
   * Never exposes raw byte values to the client.
   */
  async getClientQuota(userId: string): Promise<{ remainingPercent: number; refreshesAt: string }> {
    const { usage, maxQuota } = await this.getUsage(userId);
    return {
      remainingPercent: this.computeRemainingPercent(usage, maxQuota),
      refreshesAt: await this.getNextRefreshTime(userId),
    };
  }

  /**
   * Atomically flush local usage to Redis and return the new total.
   * Uses INCRBY which auto-creates the key if missing, then sets TTL on first creation.
   */
  private async flushUsageToRedis(usageKey: string, localBytes: number): Promise<number> {
    const totalUsage = await this.redis.incrby(usageKey, localBytes);

    // Set TTL only when the key was just created (total equals what we just added)
    if (totalUsage === localBytes) {
      await this.redis.expire(usageKey, BUCKET_TTL);
    }

    return totalUsage;
  }

  /**
   * Start tracking quota during an active streaming session.
   */
  startTracking(userId: string, sessionId: string, socket: WebSocket): void {
    if (this.intervals.has(sessionId)) return;

    this.localUsage.set(sessionId, 0);

    const interval = setInterval(async () => {
      try {
        const localBytes = this.localUsage.get(sessionId) || 0;
        this.localUsage.set(sessionId, 0);

        // Only flush to Redis if there's new usage; otherwise skip the round-trip
        if (localBytes <= 0) return;

        const { usageKey } = await this.getOrCreateBucket(userId);
        const totalUsage = await this.flushUsageToRedis(usageKey, localBytes);
        const maxQuota = await this.getMaxQuota(userId);

        if (totalUsage >= maxQuota) {
          log.warn({ userId, totalUsage, maxQuota }, "Quota exceeded during stream");
          if (socket.readyState === socket.OPEN) {
            socket.close(4002, "4-Hour Quota Exceeded");
          }
          this.stopTracking(sessionId);
        } else if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({
            type: "quota_update",
            remainingPercent: this.computeRemainingPercent(totalUsage, maxQuota),
            refreshesAt: await this.getNextRefreshTime(userId),
            timestamp: Date.now(),
          }));
        }
      } catch (err) {
        log.error({ err, userId }, "Error during quota interval sync");
      }
    }, 5000);

    this.intervals.set(sessionId, interval);
  }

  /**
   * Clear interval timer and local usage for a session on disconnect.
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

