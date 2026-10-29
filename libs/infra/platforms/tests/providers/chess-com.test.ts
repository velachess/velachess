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

function respondingTo(route: (href: string) => Response): typeof globalThis.fetch {
  return async (url) => route(String(url));
}

describe("fetchChessCom", () => {
  it("rejects an invalid username before making any request", async () => {
    let called = false;
    const fetch: typeof globalThis.fetch = async () => {
      called = true;
      return jsonResponse({});
    };

    await expect(fetchChessCom("not a valid username!", null, { fetch })).rejects.toThrow(
      "Invalid Chess.com username",
    );
    expect(called).toBe(false);
  });

  it("happy path: bootstraps up to a year of months, normalizes games, skips in-progress and variant games", async () => {
    const requested: string[] = [];
    const fetch = respondingTo((href) => {
      requested.push(href);
      if (href.endsWith("/games/archives")) return jsonResponse(CHESS_COM_ARCHIVES_INDEX);
      if (href.endsWith("/2023/12")) return jsonResponse({ games: [] });
      if (href.endsWith("/2024/01")) return jsonResponse(CHESS_COM_ARCHIVE_MONTH);
      throw new Error(`unexpected request: ${href}`);
    });

    const result = await fetchChessCom("test-player", null, { fetch });

    // A first sync reads history, not just the newest month — the index
    // has two and both are fetched, oldest first so the cursor lands on
    // the latest.
    expect(requested.some((u) => u.endsWith("/2023/12"))).toBe(true);

    // 3 entries in the fixture: 1 real, 1 in-progress (no pgn), 1 chess960.
    expect(result.games).toHaveLength(1);
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
    // The filtered variant counts as a failure, not a silent skip.
    expect(result.complete).toBe(false);
    expect(result.cursor).toEqual({ month: "2024/01", lastEndTime: 1704133706 });
  });

  it("resumes from a cursor, only fetching months at/after it", async () => {
    const requested: string[] = [];
    const fetch = respondingTo((href) => {
      requested.push(href);
      if (href.endsWith("/games/archives")) return jsonResponse(CHESS_COM_ARCHIVES_INDEX);
      if (href.endsWith("/2024/01")) return jsonResponse({ games: [] });
      throw new Error(`unexpected request: ${href}`);
    });

    const cursor: ChessComCursor = { month: "2024/01", lastEndTime: 0 };
    await fetchChessCom("test-player", cursor, { fetch });

    expect(requested.some((u) => u.endsWith("/2023/12"))).toBe(false);
    expect(requested.some((u) => u.endsWith("/2024/01"))).toBe(true);
  });

  it("a failed month becomes a SyncFailure and does not advance the cursor past it", async () => {
    const fetch = respondingTo((href) => {
      if (href.endsWith("/games/archives"))
        return jsonResponse({ archives: CHESS_COM_ARCHIVES_INDEX.archives });
      if (href.endsWith("/2023/12")) return new Response("server error", { status: 500 });
      if (href.endsWith("/2024/01")) return jsonResponse({ games: [] });
      throw new Error(`unexpected request: ${href}`);
    });

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
    expect(result.cursor).toEqual(cursor);
  });

  it("reads a month the index lists but the archive has not published as empty", async () => {
    // chess.com lists the current month before it exists. Counted as a
    // failure, the sync never completes and every later pass starts from
    // the same cursor and fails the same way.
    const fetch = respondingTo((href) => {
      if (href.endsWith("/games/archives"))
        return jsonResponse({
          archives: [
            "https://api.chess.com/pub/player/test-player/games/2023/12",
            "https://api.chess.com/pub/player/test-player/games/2024/01",
          ],
        });
      if (href.endsWith("/2023/12")) return jsonResponse({ games: [] });
      return new Response("not found", { status: 404 });
    });

    const cursor: ChessComCursor = { month: "2023/12", lastEndTime: 0 };
    const result = await fetchChessCom("test-player", cursor, { fetch });

    expect(result.failures).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.games).toEqual([]);
  });

  it("a malformed month response becomes an invalid-response failure", async () => {
    const fetch = respondingTo((href) => {
      if (href.endsWith("/games/archives"))
        return jsonResponse({
          archives: ["https://api.chess.com/pub/player/test-player/games/2024/01"],
        });
      return jsonResponse({ not: "the expected shape" });
    });

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

  it("reports a handle with no archives index as not found, for good", async () => {
    const fetch = respondingTo(() => new Response("not found", { status: 404 }));
    const result = await fetchChessCom("test-player", null, { fetch });

    expect(result.complete).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({ reason: "not-found", retryable: false }),
    ]);
  });

  it("throws if the archives index fails any other way", async () => {
    const fetch = respondingTo(() => new Response("unavailable", { status: 503 }));
    await expect(fetchChessCom("test-player", null, { fetch })).rejects.toThrow(
      "Chess.com returned no archives",
    );
  });

  it("maps a 429 on a month to a retryable rate-limited failure, carrying Retry-After", async () => {
    const fetch = respondingTo((href) => {
      if (href.endsWith("/games/archives"))
        return jsonResponse({
          archives: ["https://api.chess.com/pub/player/test-player/games/2024/01"],
        });
      return new Response("slow down", { status: 429, headers: { "Retry-After": "3" } });
    });

    const result = await fetchChessCom("test-player", null, { fetch });
    expect(result.failures).toEqual([
      {
        scope: "archive-month",
        ref: "2024/01",
        reason: "rate-limited",
        retryable: true,
        detail: "HTTP 429 (retry-after 3s)",
      },
    ]);
  });

  it("sends a contact-bearing User-Agent", async () => {
    const headers: HeadersInit[] = [];
    const fetch: typeof globalThis.fetch = async (url, init) => {
      if (init?.headers) headers.push(init.headers);
      const href = String(url);
      if (href.endsWith("/games/archives")) return jsonResponse(CHESS_COM_ARCHIVES_INDEX);
      return jsonResponse({ games: [] });
    };

    await fetchChessCom("test-player", null, { fetch });
    expect(new Headers(headers[0]).get("User-Agent")).toContain("velachess-ingest");
  });

  it("checkpoints after each successfully completed month, not after a failed one", async () => {
    const checkpoints: { cursor: ChessComCursor; gameCount: number }[] = [];
    const fetch = respondingTo((href) => {
      if (href.endsWith("/games/archives")) return jsonResponse(CHESS_COM_ARCHIVES_INDEX);
      if (href.endsWith("/2023/12")) return jsonResponse(CHESS_COM_ARCHIVE_MONTH);
      if (href.endsWith("/2024/01")) return new Response("unavailable", { status: 503 });
      throw new Error(`unexpected request: ${href}`);
    });

    const result = await fetchChessCom("test-player", null, {
      fetch,
      onCheckpoint: async (cursor, monthGames) => {
        checkpoints.push({ cursor, gameCount: monthGames.length });
      },
    });

    expect(checkpoints).toEqual([
      { cursor: { month: "2023/12", lastEndTime: 1704133706 }, gameCount: 1 },
    ]);
    expect(result.cursor).toEqual({ month: "2023/12", lastEndTime: 1704133706 });
    expect(result.complete).toBe(false);
  });
});
