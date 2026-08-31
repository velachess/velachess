import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NetworkError } from "../../api/index.ts";
import {
  confirmBackendRecovery,
  getBackendStatus,
  recordInfrastructureFailure,
  resetBackendStatus,
} from "../backend-status.ts";
import { createQueryClient } from "../../query/index.ts";
import { server } from "../../test/server.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("backend availability policy", () => {
  it("requires an explicit recovery signal after infrastructure failure", () => {
    resetBackendStatus();

    recordInfrastructureFailure();
    expect(getBackendStatus()).toBe("unavailable");

    confirmBackendRecovery();
    expect(getBackendStatus()).toBe("available");
  });

  it("does not let a successful query clear an outage", async () => {
    resetBackendStatus();
    const queryClient = createQueryClient({ retry: false });

    recordInfrastructureFailure();
    await queryClient.fetchQuery({
      queryKey: ["healthy-but-not-a-health-check"],
      queryFn: async () => "ok",
    });

    expect(getBackendStatus()).toBe("unavailable");
  });

  it("recovers only after the explicit health probe succeeds", async () => {
    vi.useFakeTimers();
    resetBackendStatus();
    server.use(http.get("/api/health", () => HttpResponse.json({ ok: true })));

    const queryClient = createQueryClient({ retry: false });
    await expect(
      queryClient.fetchQuery({
        queryKey: ["down"],
        queryFn: async () => {
          throw new NetworkError("down");
        },
      }),
    ).rejects.toBeInstanceOf(NetworkError);

    expect(getBackendStatus()).toBe("unavailable");

    await vi.advanceTimersByTimeAsync(5_000);

    expect(getBackendStatus()).toBe("available");
  });
});
