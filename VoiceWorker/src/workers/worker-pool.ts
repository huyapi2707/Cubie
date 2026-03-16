import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/index.js";
import { createChildLogger, metrics } from "../utils/index.js";
import type {
  WorkerTaskPayload,
  WorkerTaskResult,
  WorkerMessage,
  WorkerResponse,
} from "../types/worker.js";

const log = createChildLogger({ module: "worker-pool" });

interface PendingTask {
  resolve: (result: WorkerTaskResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PoolWorker {
  worker: Worker;
  busy: boolean;
  taskCount: number;
}

/**
 * Resolves the worker script path, handling both dev (tsx) and
 * production (compiled JS) environments.
 *
 * In development:
 *   - Uses a CJS bootstrap file that registers tsx hooks, then
 *     requires the TypeScript worker source. This works reliably
 *     across all Node.js versions (18+) because tsx/cjs hooks
 *     are synchronous and don't depend on ESM loader propagation.
 *
 * In production (compiled):
 *   - Uses the compiled .js output directly with no special flags.
 */
function resolveWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  const bootstrapPath = path.join(currentDir, "worker-bootstrap.cjs");
  const jsPath = path.join(currentDir, "audio-worker.js");

  // If the CJS bootstrap exists (dev mode), use it
  if (fs.existsSync(bootstrapPath)) {
    return bootstrapPath;
  }

  // Production: use compiled JS
  return jsPath;
}

/**
 * Manages a pool of Worker Threads for CPU-intensive audio processing.
 *
 * Features:
 *   - Fixed-size thread pool with configurable size
 *   - Round-robin task distribution with busy tracking
 *   - Timeout handling for stuck tasks
 *   - Graceful shutdown
 */
export class WorkerPool {
  private workers: PoolWorker[] = [];
  private pendingTasks = new Map<string, PendingTask>();
  private taskQueue: Array<{
    id: string;
    message: WorkerMessage;
    pending: PendingTask;
  }> = [];
  private isShuttingDown = false;

  /**
   * Initialize the worker pool with the configured number of threads.
   */
  async initialize(): Promise<void> {
    const poolSize = config.WORKER_POOL_SIZE;
    const workerPath = resolveWorkerPath();

    log.info({ poolSize, workerPath }, "Initializing worker pool");

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerPath);

      const poolWorker: PoolWorker = {
        worker,
        busy: false,
        taskCount: 0,
      };

      worker.on("message", (response: WorkerResponse) => {
        this.handleWorkerResponse(poolWorker, response);
      });

      worker.on("error", (err) => {
        log.error({ err, workerIndex: i }, "Worker error");
        metrics.increment("workers.errors");
      });

      worker.on("exit", (code) => {
        if (code !== 0 && !this.isShuttingDown) {
          log.error({ workerIndex: i, code }, "Worker exited unexpectedly");
          metrics.increment("workers.unexpected_exits");
        }
      });

      this.workers.push(poolWorker);
    }

    metrics.gauge("workers.pool_size", poolSize);
    log.info({ poolSize }, "Worker pool initialized");
  }

  /**
   * Submit a task to the worker pool.
   * Returns a promise that resolves with the task result.
   */
  async submitTask(payload: WorkerTaskPayload): Promise<WorkerTaskResult> {
    if (this.isShuttingDown) {
      throw new Error("Worker pool is shutting down");
    }

    const taskId = uuidv4();

    const message: WorkerMessage = {
      id: taskId,
      payload,
    };

    return new Promise<WorkerTaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        metrics.increment("workers.timeouts");
        reject(
          new Error(
            `Worker task timed out after ${config.WORKER_TASK_TIMEOUT_MS}ms`
          )
        );
      }, config.WORKER_TASK_TIMEOUT_MS);

      const pending: PendingTask = { resolve, reject, timer };

      // Try to find a free worker
      const freeWorker = this.workers.find((w) => !w.busy);

      if (freeWorker) {
        this.pendingTasks.set(taskId, pending);
        this.dispatchToWorker(freeWorker, taskId, message);
      } else {
        // Queue the task for later dispatch
        this.taskQueue.push({ id: taskId, message, pending });
        metrics.increment("workers.queued_tasks");
      }
    });
  }

  /**
   * Gracefully shut down all workers.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Reject all pending tasks
    for (const [id, pending] of this.pendingTasks) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Worker pool shutting down"));
      this.pendingTasks.delete(id);
    }

    // Reject all queued tasks
    for (const queued of this.taskQueue) {
      clearTimeout(queued.pending.timer);
      queued.pending.reject(new Error("Worker pool shutting down"));
    }
    this.taskQueue = [];

    // Terminate all workers
    const terminations = this.workers.map((pw) => pw.worker.terminate());
    await Promise.allSettled(terminations);

    this.workers = [];
    log.info("Worker pool shut down");
  }

  /**
   * Get pool status for monitoring.
   */
  getStatus() {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      pendingTasks: this.pendingTasks.size,
      queuedTasks: this.taskQueue.length,
      taskCounts: this.workers.map((w) => w.taskCount),
    };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private dispatchToWorker(
    poolWorker: PoolWorker,
    _taskId: string,
    message: WorkerMessage
  ): void {
    poolWorker.busy = true;
    poolWorker.taskCount++;
    poolWorker.worker.postMessage(message);

    metrics.increment("workers.tasks_dispatched");
  }

  private handleWorkerResponse(
    poolWorker: PoolWorker,
    response: WorkerResponse
  ): void {
    poolWorker.busy = false;

    const pending = this.pendingTasks.get(response.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingTasks.delete(response.id);

      metrics.recordLatency(
        `workers.${response.result.type}_latency`,
        response.result.durationMs
      );

      if (response.result.success) {
        metrics.increment("workers.tasks_completed");
      } else {
        metrics.increment("workers.tasks_failed");
      }

      pending.resolve(response.result);
    }

    // Check if there are queued tasks to dispatch
    if (this.taskQueue.length > 0) {
      const next = this.taskQueue.shift()!;
      this.pendingTasks.set(next.id, next.pending);
      this.dispatchToWorker(poolWorker, next.id, next.message);
    }
  }
}
