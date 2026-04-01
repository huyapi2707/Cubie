import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const EnvSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3200),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  DATABASE_URL: z.string().url().min(1),
  REDIS_URL: z.string().url().min(1),

  AUTH_SECRET: z.string().min(1).default("dev-secret-key"),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  WS_MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(1_048_576),
  WS_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  WS_HEARTBEAT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),

  WORKER_POOL_SIZE: z.coerce.number().int().min(1).max(32).default(4),
  WORKER_TASK_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  AUDIO_CHUNK_MAX_BYTES: z.coerce.number().int().positive().default(65_536),
  AUDIO_BUFFER_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10_485_760),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1),
  GOOGLE_PROJECT_ID: z.string().min(1),
  GOOGLE_PROJECT_LOCATION: z.string().min(1).default("us-central1"),
});

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      "❌ Invalid environment configuration:",
      parsed.error.flatten().fieldErrors
    );
    process.exit(1);
  }

  return Object.freeze(parsed.data);
}

export const config = loadConfig();
export type Config = typeof config;
