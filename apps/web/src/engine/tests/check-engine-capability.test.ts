import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wasm-feature-detect", () => ({ simd: vi.fn() }));

import { simd } from "wasm-feature-detect";

import { checkEngineCapability } from "../check-engine-capability.ts";

// jsdom defines no `Worker` global of its own, unlike a real browser —
// stub one in for every case that isn't exercising that specific gate.
function StubWorker(): void {}

describe("checkEngineCapability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports ok once Worker, WebAssembly and SIMD are all available", async () => {
    vi.stubGlobal("Worker", StubWorker);
    vi.mocked(simd).mockResolvedValue(true);

    await expect(checkEngineCapability()).resolves.toEqual({ ok: true });
  });

  it("reports no-worker without ever checking SIMD, when Worker is missing", async () => {
    await expect(checkEngineCapability()).resolves.toEqual({
      ok: false,
      reason: "no-worker",
    });
    expect(simd).not.toHaveBeenCalled();
  });

  it("reports no-wasm when WebAssembly is missing", async () => {
    vi.stubGlobal("Worker", StubWorker);
    vi.stubGlobal("WebAssembly", undefined);

    await expect(checkEngineCapability()).resolves.toEqual({
      ok: false,
      reason: "no-wasm",
    });
  });

  it("reports no-wasm when the environment lacks SIMD support", async () => {
    vi.stubGlobal("Worker", StubWorker);
    vi.mocked(simd).mockResolvedValue(false);

    await expect(checkEngineCapability()).resolves.toEqual({
      ok: false,
      reason: "no-wasm",
    });
  });
});
