import { Redis } from 'ioredis';
import type { UserService } from './user-service.js';
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "quota-service" });

const BUCKET_MS = 4 * 60 * 60 * 1000;   // 4 hours
const BUCKET_TTL = 14400;                // 4 hours in seconds
const MAX_QUOTA_TTL = 3600;              // 1 hour cache

export class QuotaService {
  private redis: Redis;

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
   * Get or create the user's active quota bucket.
   * If no bucket exists (user was idle), a new 4-hour window starts from now.
   */
  private async getOrCreateBucket(userId: string): Promise<{ usageKey: string; bucketStart: number }> {
    const startKey = `user:${userId}:bucket_start`;
    try {
      const cached = await this.redis.get(startKey);
      if (cached !== null) {
        const bucketStart = parseInt(cached, 10);
        return { usageKey: `user:${userId}:usage:${bucketStart}`, bucketStart };
      }
    } catch (err) {
      log.warn({ err, userId }, "Failed to read bucket start from Redis");
    }

    const bucketStart = Date.now();
    await this.redis.set(startKey, bucketStart, 'EX', BUCKET_TTL);
    return { usageKey: `user:${userId}:usage:${bucketStart}`, bucketStart };
  }

  /**
   * Returns the ISO timestamp when the user's current quota window resets.
   */
  async getNextRefreshTime(userId: string): Promise<string> {
    const { bucketStart } = await this.getOrCreateBucket(userId);
    return new Date(bucketStart + BUCKET_MS).toISOString();
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
   * Creates a new bucket if none exists.
   */
  async checkQuota(userId: string): Promise<boolean> {
    const maxQuota = await this.getMaxQuota(userId);
    const { usageKey } = await this.getOrCreateBucket(userId);

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
   * Increment usage directly in Redis for the user's active bucket.
   */
  async incrementUsage(userId: string, value: number): Promise<void> {
    if (value <= 0) return;

    try {
      const { usageKey } = await this.getOrCreateBucket(userId);
      const totalUsage = await this.redis.incrby(usageKey, value);

      // Set TTL only when the key was just created
      if (totalUsage === value) {
        await this.redis.expire(usageKey, BUCKET_TTL);
      }
    } catch (err) {
      log.error({ err, userId }, "Failed to increment usage in Redis");
    }
  }

  // ─── Per-Step Cost Calculation ──────────────────────────────────────────────

  /**
   * Calculate the quota cost for an STT result.
   * Charged per character of transcribed text.
   */
  private calculateSttCost(textLength: number): number {
    return textLength;
  }

  /**
   * Calculate the quota cost for a translation result.
   * Charged per character of translated text.
   */
  private calculateTranslationCost(textLength: number): number {
    return textLength;
  }

  /**
   * Calculate the quota cost for a TTS result.
   * Charged per byte of synthesized audio buffer (PCM Int16 = 2 bytes/sample @ 24kHz).
   * Divided by 2 to normalize to a comparable unit with text-based steps.
   */
  private calculateTtsCost(audioBufferLength: number): number {
    log.debug({ cost: Math.ceil(audioBufferLength / 2) }, "TTS cost");
    return Math.ceil(audioBufferLength / 2);
  }

  /**
   * Increment usage for an STT step.
   * @param userId - The user ID
   * @param text - The transcribed text returned by the STT service
   */
  async incrementSttUsage(userId: string, text: string): Promise<void> {
    const cost = this.calculateSttCost(text.length);
    log.debug({ userId, textLength: text.length, cost }, "STT usage");
    await this.incrementUsage(userId, cost);
  }

  /**
   * Increment usage for a translation step.
   * @param userId - The user ID
   * @param text - The translated text returned by the translation service
   */
  async incrementTranslationUsage(userId: string, text: string): Promise<void> {
    const cost = this.calculateTranslationCost(text.length);
    log.debug({ userId, textLength: text.length, cost }, "Translation usage");
    await this.incrementUsage(userId, cost);
  }

  /**
   * Increment usage for a TTS step.
   * @param userId - The user ID
   * @param audioBuffer - The raw PCM audio buffer from the TTS service
   */
  async incrementTtsUsage(userId: string, audioBuffer: Buffer | Float32Array): Promise<void> {
    const cost = this.calculateTtsCost(audioBuffer.length);
    log.debug({ userId, bufferLength: audioBuffer.length, cost }, "TTS usage");
    await this.incrementUsage(userId, cost);
  }

  /**
   * Get the current usage and max quota for a user in the active bucket.
   */
  async getUsage(userId: string): Promise<{ usage: number; maxQuota: number }> {
    const maxQuota = await this.getMaxQuota(userId);
    const { usageKey } = await this.getOrCreateBucket(userId);

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
}
