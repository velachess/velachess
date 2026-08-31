import { describe, expect, it } from "vitest";

import { fetchChessCom } from "@velachess/infra-platforms";
import { CHESS_COM_ARCHIVES_INDEX, CHESS_COM_ARCHIVE_MONTH } from "@velachess/fixtures";
import type { ChessComCursor } from "../../providers/chess-com.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchChessCom", () => {
  it("rejects an invalid username before making any request", async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof globalThis.fetch;

    await expect(fetchChessCom("not a valid username!", null, { fetch })).rejects.toThrow(
      "Invalid Chess.com username",
    );
    expect(called).toBe(false);
  });

  it("happy path: bootstraps up to a year of months, normalizes games, skips in-progress and variant games", async () => {
    const requested: string[] = [];
    const fetch = (async (url: string | URL) => {
      const href = String(url);
      requested.push(href);
      if (href.endsWith("/games/archives")) return jsonResponse(CHESS_COM_ARCHIVES_INDEX);
      if (href.endsWith("/2023/12")) return jsonResponse({ games: [] });
      if (href.endsWith("/2024/01")) return jsonResponse(CHESS_COM_ARCHIVE_MONTH);
      throw new Error(`unexpected request: ${href}`);
    }) as typeof globalThis.fetch;

    const result = await fetchChessCom("test-player", null, { fetch });

    // A first sync reads history, not just the newest month — the index
    // has two and both are fetched, oldest first so the cursor lands on
    // the latest.
    expect(requested.some((u) => u.endsWith("/2023/12"))).toBe(true);

    expect(result.games).toHaveLength(1); // 3 entries in fixture: 1 real, 1 in-progress (no pgn), 1 chess960
    expect(result.games[0]?.source).toBe("chess_com");
    expect(result.failures).toEqual([
      {
        scope: "game",
        ref: "https://www.chess.com/game/live/100000003",
        reason: "unsupported-variant",
        retryable: false,
        detail: "chess960",
      },
    ]);
    expect(result.complete).toBe(false); // the filtered variant counts as a failure
    expect(result.cursor).toEqual({ month: "2024/01", lastEndTime: 1704133706 });
  });

  it("resumes from a cursor, only fetching months at/after it", async () => {
    const requested: string[] = [];
    const fetch = (async (url: string | URL) => {
      const href = String(url);
      requested.push(href);
      if (href.endsWith("/games/archives")) return jsonResponse(CHESS_COM_ARCHIVES_INDEX);
      if (href.endsWith("/2024/01")) return jsonResponse({ games: [] });
      throw new Error(`unexpected request: ${href}`);
    }) as typeof globalThis.fetch;

    const cursor: ChessComCursor = { month: "2024/01", lastEndTime: 0 };
    await fetchChessCom("test-player", cursor, { fetch });

    expect(requested.some((u) => u.endsWith("/2023/12"))).toBe(false);
    expect(requested.some((u) => u.endsWith("/2024/01"))).toBe(true);
  });

  it("a failed month becomes a SyncFailure and does not advance the cursor past it", async () => {
    const fetch = (async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/games/archives"))
        return jsonResponse({ archives: CHESS_COM_ARCHIVES_INDEX.archives });
      if (href.endsWith("/2023/12")) return new Response("server error", { status: 500 });
      if (href.endsWith("/2024/01")) return jsonResponse({ games: [] });
      throw new Error(`unexpected request: ${href}`);
    }) as typeof globalThis.fetch;

    const cursor: ChessComCursor = { month: "2023/12", lastEndTime: 0 };
    const result = await fetchChessCom("test-player", cursor, { fetch });

    expect(result.failures).toEqual([
      {
        scope: "archive-month",
        ref: "2023/12",
        reason: "http-error",
        retryable: true,
        detail: "HTTP 500",
      },
    ]);
    expect(result.complete).toBe(false);
    expect(result.cursor).toEqual(cursor); // did not advance past the failed month
  });

  it("a malformed month response becomes an invalid-response failure", async () => {
    const fetch = (async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/games/archives"))
        return jsonResponse({
          archives: ["https://api.chess.com/pub/player/test-player/games/2024/01"],
        });
      return jsonResponse({ not: "the expected shape" });
    }) as typeof globalThis.fetch;

    const result = await fetchChessCom("test-player", null, { fetch });
    expect(result.failures).toEqual([
      {
        scope: "archive-month",
        ref: "2024/01",
        reason: "invalid-response",
        retryable: true,
        detail: expect.any(String),
      },
    ]);
  });

  it("throws if the archives index itself fails", async () => {
    const fetch = (async () =>
      new Response("not found", { status: 404 })) as typeof globalThis.fetch;
    await expect(fetchChessCom("test-player", null, { fetch })).rejects.toThrow(
      "Chess.com returned no archives",
    );
  });
});
