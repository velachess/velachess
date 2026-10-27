import pino from "pino";
import { describe, expect, it } from "vitest";

import { loggerOptions } from "../index.ts";

function capture() {
  const lines: string[] = [];
  const log = pino(
    { ...loggerOptions, level: "info" },
    { write: (line: string) => lines.push(line) },
  );
  return {
    log,
    records: () => lines.map((line): Record<string, unknown> => JSON.parse(line)),
  };
}

describe("the logger's configuration", () => {
  it("keeps an Error's message and stack", () => {
    // The property that failed in production: `{ error }` serialized to
    // `{}`, so every 500 was logged without its cause.
    const { log, records } = capture();

    log.error({ error: new Error("the cause") }, "unhandled api error");

    expect(records()[0]?.["error"]).toMatchObject({
      message: "the cause",
      stack: expect.stringContaining("logger.test"),
    });
  });

  it("censors a secret handed to it by name", () => {
    const { log, records } = capture();

    log.info({ config: { password: "hunter2", token: "abc" } }, "boot");

    const record = records()[0]!;
    expect(JSON.stringify(record)).not.toContain("hunter2");
    expect(JSON.stringify(record)).toContain("[REDACTED]");
  });
});
