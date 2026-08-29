import pino from "pino";
import { describe, expect, it } from "vitest";

import { loggerOptions } from "../index.ts";

/** The shipped configuration, writing where the test can read it. */
function capture() {
  const lines: string[] = [];
  const log = pino(
    { ...loggerOptions, level: "info" },
    { write: (line: string) => lines.push(line) },
  );
  return {
    log,
    records: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("the logger's configuration", () => {
  it("keeps an Error's message and stack", () => {
    // The property that failed in production: `{ error }` serialized to
    // `{}`, so every 500 was logged without its cause.
    const { log, records } = capture();

    log.error({ error: new Error("the cause") }, "unhandled api error");

    const record = records()[0]!;
    const error = record["error"] as { message?: string; stack?: string };
    expect(error.message).toBe("the cause");
    expect(error.stack).toContain("logger.test");
  });

  it("censors a secret handed to it by name", () => {
    const { log, records } = capture();

    log.info({ config: { password: "hunter2", token: "abc" } }, "boot");

    const record = records()[0]!;
    expect(JSON.stringify(record)).not.toContain("hunter2");
    expect(JSON.stringify(record)).toContain("[REDACTED]");
  });
});
