import { describe, expect, it } from "vitest";

import { fetchLichess } from "@velachess/platforms";
import { LICHESS_PGN_EXPORT, LICHESS_VARIANT_PGN } from "@velachess/fixtures";

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe("fetchLichess", () => {
  it("rejects an invalid username before making any request", async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return textResponse("");
    }) as typeof globalThis.fetch;

    await expect(fetchLichess("not valid!", null, { fetch })).rejects.toThrow(
      "Invalid Lichess username",
    );
    expect(called).toBe(false);
  });

  it("happy path: normalizes both games from a real export and advances the cursor", async () => {
    const fetch = (async () =>
      textResponse(LICHESS_PGN_EXPORT)) as typeof globalThis.fetch;

    const result = await fetchLichess("arex", null, { fetch });

    expect(result.games).toHaveLength(2);
    expect(result.games[0]?.source).toBe("lichess");
    expect(result.games[0]?.externalId).toBe("TJxUmbWK");
    expect(result.games[1]?.externalId).toBe("aB3dEfGh");
    expect(result.complete).toBe(true);
    expect(result.cursor).not.toBeNull();
  });

  it("requests Accept: application/x-chess-pgn and passes since= from the cursor", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    const fetch = (async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      return textResponse(LICHESS_PGN_EXPORT);
    }) as typeof globalThis.fetch;

    await fetchLichess("arex", { sinceMs: 1704000000000 }, { fetch });

    expect(capturedUrl).toContain("since=1704000000000");
    expect(capturedUrl).toContain("sort=dateAsc");
    expect(new Headers(capturedHeaders).get("Accept")).toBe("application/x-chess-pgn");
  });

  it("filters non-Standard variant games and reports them as unsupported-variant", async () => {
    const fetch = (async () =>
      textResponse(LICHESS_VARIANT_PGN)) as typeof globalThis.fetch;

    const result = await fetchLichess("arex", null, { fetch });

    expect(result.games).toHaveLength(0);
    expect(result.failures).toEqual([
      {
        scope: "game",
        ref: "zZ9yYxXw",
        reason: "unsupported-variant",
        retryable: false,
        detail: "Chess960",
      },
    ]);
  });

  it("an empty response means no new games since the cursor, not a failure", async () => {
    const fetch = (async () => textResponse("")) as typeof globalThis.fetch;
    const result = await fetchLichess("arex", null, { fetch });
    expect(result).toEqual({ games: [], failures: [], cursor: null, complete: true });
  });

  it("maps a 429 to a retryable rate-limited failure", async () => {
    const fetch = (async () => textResponse("", 429)) as typeof globalThis.fetch;
    const result = await fetchLichess("arex", null, { fetch });
    expect(result.failures[0]).toMatchObject({ reason: "rate-limited", retryable: true });
    expect(result.complete).toBe(false);
  });

  it("a non-PGN 200 response is reported as invalid-response, not silently parsed as zero games", async () => {
    const fetch = (async () =>
      textResponse("<html>not pgn</html>")) as typeof globalThis.fetch;
    const result = await fetchLichess("arex", null, { fetch });
    expect(result.failures[0]).toMatchObject({ reason: "invalid-response" });
  });
});
