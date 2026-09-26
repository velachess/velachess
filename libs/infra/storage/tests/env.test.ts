import { describe, expect, it } from "vitest";

import { resolveStorageEnv } from "../env.ts";

describe("resolveStorageEnv", () => {
  it("defaults to a development root when the variable is unset", () => {
    expect(resolveStorageEnv({}).root).toBe(".data/storage");
  });

  it("takes the configured path", () => {
    expect(resolveStorageEnv({ VELACHESS_STORAGE_DIR: "/data" }).root).toBe("/data");
  });

  /** A relative root resolves against the process's working directory. In
   * a container that is the image's own layer, so the next `up --build`
   * deletes every upload — a deploy that looks healthy until a restart. */
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

  /** An unset NODE_ENV is development in this repo, the opposite of
   * envalid's own isProduction — so a relative default must be fine here. */
  it("treats an unset NODE_ENV as development", () => {
    expect(resolveStorageEnv({}).root).toBe(".data/storage");
  });
});
