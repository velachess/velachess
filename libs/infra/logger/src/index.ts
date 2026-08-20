import pino from "pino";

export type { Logger } from "pino";

export const loggerOptions = {
  level: process.env["LOG_LEVEL"] ?? "info",
  base: {
    service: process.env["SERVICE_NAME"] ?? "velachess",
    environment: process.env["NODE_ENV"] ?? "development",
  },
  // Without this, `logger.error({ error }, "…")` writes `"error":{}`: an
  // Error's message and stack are non-enumerable, so the JSON pass drops
  // both. Every 500 was logged without its cause until the serializer was
  // pointed at the key the code actually uses.
  serializers: { error: pino.stdSerializers.err },
  redact: {
    paths: ["req.headers.authorization", "*.password", "*.token", "*.secret"],
    censor: "[REDACTED]",
  },
} satisfies pino.LoggerOptions;

export const logger = pino(loggerOptions);
