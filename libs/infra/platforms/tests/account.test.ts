import { describe, expect, it } from "vitest";

import { verifyAccountExists } from "../providers/account.ts";

function respondWith(status: number): typeof globalThis.fetch {
  return async () => new Response("", { status });
}

describe("verifyAccountExists", () => {
  it("confirms a handle both providers answer for", async () => {
    for (const platform of ["chess_com", "lichess"] as const) {
      const result = await verifyAccountExists(platform, "yurimutti", {
        fetch: respondWith(200),
      });
      expect(result).toEqual({ status: "exists" });
    }
  });

  it("asks each provider its own public user endpoint", async () => {
    const asked: string[] = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      asked.push(String(input));
      return new Response("", { status: 200 });
    };

    await verifyAccountExists("chess_com", "yurimutti", { fetch });
    await verifyAccountExists("lichess", "yurimutti", { fetch });

    expect(asked).toEqual([
      "https://api.chess.com/pub/player/yurimutti",
      "https://lichess.org/api/user/yurimutti",
    ]);
  });

  it("reads a 404 as a handle that does not exist", async () => {
    expect(
      await verifyAccountExists("chess_com", "nobody", { fetch: respondWith(404) }),
    ).toEqual({ status: "failed", reason: "not-found" });
  });

  it("keeps any other unhappy status an outage, never a missing handle", async () => {
    for (const status of [429, 500, 502, 503]) {
      expect(
        await verifyAccountExists("lichess", "someone", { fetch: respondWith(status) }),
      ).toEqual({ status: "failed", reason: "unavailable" });
    }
  });

  it("fails soft when fetch rejects or the request is aborted", async () => {
    const network = await verifyAccountExists("chess_com", "someone", {
      fetch: async () => {
        throw new Error("network error");
      },
    });
    const aborted = await verifyAccountExists("lichess", "someone", {
      fetch: async () => {
        throw new DOMException("Aborted", "AbortError");
      },
    });

    expect(network).toEqual({ status: "failed", reason: "unavailable" });
    expect(aborted).toEqual({ status: "failed", reason: "unavailable" });
  });

  it("does not call out at all for a username that cannot exist", async () => {
    let called = false;
    const result = await verifyAccountExists("chess_com", "!!bad!!", {
      fetch: async () => {
        called = true;
        return new Response();
      },
    });

    expect(called).toBe(false);
    expect(result).toEqual({ status: "failed", reason: "not-found" });
  });
});
