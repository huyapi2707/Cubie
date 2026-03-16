/**
 * Metrics collector for observability.
 * Tracks connection counts, processing latencies, and error rates.
 */
export class Metrics {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  decrement(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, Math.max(0, current - value));
  }

  gauge(name: string, value: number): void {
    this.counters.set(name, value);
  }

  recordLatency(name: string, durationMs: number): void {
    const existing = this.histograms.get(name) ?? [];
    existing.push(durationMs);

    // Keep only the last 1000 measurements to prevent memory growth
    if (existing.length > 1000) {
      existing.splice(0, existing.length - 1000);
    }

    this.histograms.set(name, existing);
  }

  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  getLatencyStats(name: string): LatencyStats | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    const latencies: Record<string, LatencyStats> = {};

    for (const [key, value] of this.counters) {
      counters[key] = value;
    }

    for (const [key] of this.histograms) {
      const stats = this.getLatencyStats(key);
      if (stats) {
        latencies[key] = stats;
      }
    }

    return { counters, latencies, timestamp: Date.now() };
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  latencies: Record<string, LatencyStats>;
  timestamp: number;
}

/** Singleton metrics instance */
export const metrics = new Metrics();
