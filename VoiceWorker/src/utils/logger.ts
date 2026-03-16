import pino from "pino";
import { config } from "../config/index.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    service: "voice-worker",
    env: config.NODE_ENV,
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
