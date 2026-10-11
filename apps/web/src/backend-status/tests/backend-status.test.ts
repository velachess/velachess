import { describe, expect, it } from "vitest";

import { NetworkError } from "../../api/index.ts";
import { getBackendStatus, resetBackendStatus } from "../backend-status.ts";
import { createQueryClient } from "../../query/index.ts";

async function failOnce(queryClient: ReturnType<typeof createQueryClient>, key: string) {
  await expect(
    queryClient.fetchQuery({
      queryKey: [key],
      queryFn: async () => {
        throw new NetworkError("down");
      },
    }),
  ).rejects.toBeInstanceOf(NetworkError);
}

describe("backend availability policy", () => {
  it("reports an outage when a request fails on infrastructure", async () => {
    resetBackendStatus();
    const queryClient = createQueryClient();

    await failOnce(queryClient, "down");

    expect(getBackendStatus()).toBe("unavailable");
  });

  it("keeps the outage after a later request succeeds", async () => {
    resetBackendStatus();
    const queryClient = createQueryClient();

    await failOnce(queryClient, "down");
    await queryClient.fetchQuery({ queryKey: ["healthy"], queryFn: async () => "ok" });

    expect(getBackendStatus()).toBe("unavailable");
  });

  it("does not retry a failed request", async () => {
    resetBackendStatus();
    const queryClient = createQueryClient();
    let attempts = 0;

    await expect(
      queryClient.fetchQuery({
        queryKey: ["counted"],
        queryFn: async () => {
          attempts += 1;
          throw new NetworkError("down");
        },
      }),
    ).rejects.toBeInstanceOf(NetworkError);

    expect(attempts).toBe(1);
  });
});
