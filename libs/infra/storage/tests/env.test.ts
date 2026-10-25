import { describe, expect, it } from "vitest";

import { resolveStorageEnv } from "../env.ts";

describe("resolveStorageEnv", () => {
  it("defaults to a development root when the variable is unset", () => {
    expect(resolveStorageEnv({}).root).toBe(".data/storage");
  });

  it("takes the configured path", () => {
    expect(resolveStorageEnv({ VELACHESS_STORAGE_DIR: "/data" }).root).toBe("/data");
  });

  it("refuses a relative path in production, naming the variable", () => {
    expect(() =>
      resolveStorageEnv({ NODE_ENV: "production", VELACHESS_STORAGE_DIR: ".data" }),
    ).toThrow(/VELACHESS_STORAGE_DIR must be an absolute path in production/);
  });

  it("refuses the development default in production too", () => {
    expect(() => resolveStorageEnv({ NODE_ENV: "production" })).toThrow(
      /absolute path in production/,
    );
  });

  it("accepts an absolute path in production", () => {
    expect(
      resolveStorageEnv({ NODE_ENV: "production", VELACHESS_STORAGE_DIR: "/data" }).root,
    ).toBe("/data");
  });

  it("treats an empty value as unset", () => {
    expect(resolveStorageEnv({ VELACHESS_STORAGE_DIR: "" }).root).toBe(".data/storage");
  });
});
