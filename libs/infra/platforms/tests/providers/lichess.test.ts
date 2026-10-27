import { describe, expect, it } from "vitest";

import { fetchLichess } from "@velachess/infra-platforms";
import { LICHESS_PGN_EXPORT, LICHESS_VARIANT_PGN } from "@velachess/fixtures";

function answering(body: string, init?: ResponseInit): typeof globalThis.fetch {
  return async () => new Response(body, init);
}

describe("fetchLichess", () => {
  it("rejects an invalid username before making any request", async () => {
    let called = false;
    const fetch: typeof globalThis.fetch = async () => {
      called = true;
      return new Response("");
    };

    await expect(fetchLichess("not valid!", null, { fetch })).rejects.toThrow(
      "Invalid Lichess username",
    );
    expect(called).toBe(false);
  });

  it("happy path: normalizes both games from a real export and advances the cursor", async () => {
    const fetch = answering(LICHESS_PGN_EXPORT);

    const result = await fetchLichess("arex", null, { fetch });

    expect(result.games).toHaveLength(2);
    expect(result.games[0]?.source).toBe("lichess");
    expect(result.games[0]?.externalId).toBe("TJxUmbWK");
    expect(result.games[1]?.externalId).toBe("aB3dEfGh");
    expect(result.complete).toBe(true);
    expect(result.cursor).not.toBeNull();
  });

  it("requests Accept: application/x-chess-pgn, a contact-bearing User-Agent, and passes since= from the cursor", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    const fetch: typeof globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      return new Response(LICHESS_PGN_EXPORT);
    };

    await fetchLichess("arex", { sinceMs: 1704000000000 }, { fetch });

    expect(capturedUrl).toContain("since=1704000000000");
    expect(capturedUrl).toContain("sort=dateAsc");
    expect(new Headers(capturedHeaders).get("Accept")).toBe("application/x-chess-pgn");
    expect(new Headers(capturedHeaders).get("User-Agent")).toContain("velachess-ingest");
  });

  it("filters non-Standard variant games and reports them as unsupported-variant", async () => {
    const fetch = answering(LICHESS_VARIANT_PGN);

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
    const fetch = answering("");
    const result = await fetchLichess("arex", null, { fetch });
    expect(result).toEqual({ games: [], failures: [], cursor: null, complete: true });
  });

  it("maps a 404 to a permanent not-found failure", async () => {
    const fetch = answering("", { status: 404 });
    const result = await fetchLichess("gone-player", null, { fetch });

    expect(result.complete).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({ reason: "not-found", retryable: false }),
    ]);
  });

  it("maps a 429 to a retryable rate-limited failure, carrying Retry-After", async () => {
    const fetch = answering("", {
      status: 429,
      headers: { "Retry-After": "7" },
    });
    const result = await fetchLichess("arex", null, { fetch });
    expect(result.failures[0]).toMatchObject({
      reason: "rate-limited",
      retryable: true,
      detail: expect.stringContaining("retry-after 7s"),
    });
    expect(result.complete).toBe(false);
  });

  it("a non-PGN 200 response is reported as invalid-response, not silently parsed as zero games", async () => {
    const fetch = answering("<html>not pgn</html>");
    const result = await fetchLichess("arex", null, { fetch });
    expect(result.failures[0]).toMatchObject({ reason: "invalid-response" });
  });
});
