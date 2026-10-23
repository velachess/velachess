/**
 * Lichess's game-export API is public, OAuth only raising the rate-limit
 * tier. It asks for raw PGN rather than NDJSON, so this provider reuses the
 * same split and normalize path as chess-com.ts and pgn.ts.
 */

import { z } from "zod";

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import { USER_AGENT } from "./chess-com.ts";
import { splitPgnGames } from "../split.ts";
import type { FetchFn, SyncFailure, SyncResult } from "../schema.ts";

/**
 * A schema rather than an interface for the same reason as
 * `chessComCursorSchema`: one `jsonb` column holds both shapes and only the
 * reader tells them apart.
 */
export const lichessCursorSchema = z.object({
  /** Epoch millis of the newest game seen, plus one. */
  sinceMs: z.number(),
});
export type LichessCursor = z.infer<typeof lichessCursorSchema>;

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,30}$/;
const PAGE_SIZE = 300;

const GAME_ID_TAG = /\[GameId "([^"]*)"\]/;
const SITE_TAG = /\[Site "([^"]*)"\]/;
const VARIANT_TAG = /\[Variant "([^"]*)"\]/;

export async function fetchLichess(
  username: string,
  cursor: LichessCursor | null,
  opts: { fetch?: FetchFn; signal?: AbortSignal } = {},
): Promise<SyncResult & { cursor: LichessCursor | null }> {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`Invalid Lichess username: "${username}"`);
  }
  const doFetch = opts.fetch ?? globalThis.fetch;

  const params = new URLSearchParams({
    sort: "dateAsc",
    max: String(PAGE_SIZE),
    tags: "true",
    clocks: "true",
    opening: "true",
  });
  if (cursor) params.set("since", String(cursor.sinceMs));

  const headers = { Accept: "application/x-chess-pgn", "User-Agent": USER_AGENT };
  const res = await doFetch(
    `https://lichess.org/api/games/user/${username}?${params}`,
    opts.signal ? { headers, signal: opts.signal } : { headers },
  );

  if (res.status === 404) {
    return {
      games: [],
      failures: [
        {
          scope: "page",
          ref: username,
          reason: "not-found",
          retryable: false,
          detail: "HTTP 404",
        },
      ],
      cursor,
      complete: false,
    };
  }
  if (!res.ok) {
    const reason = res.status === 429 ? "rate-limited" : "http-error";
    const retryAfter = res.headers.get("Retry-After");
    return {
      games: [],
      failures: [
        {
          scope: "page",
          ref: String(cursor?.sinceMs ?? "initial"),
          reason,
          retryable: true,
          detail: `HTTP ${res.status}${retryAfter ? ` (retry-after ${retryAfter}s)` : ""}`,
        },
      ],
      cursor,
      complete: false,
    };
  }

  const text = await res.text();
  if (text.trim().length === 0) {
    return { games: [], failures: [], cursor, complete: true };
  }
  if (!text.includes("[Event ")) {
    return {
      games: [],
      failures: [
        {
          scope: "page",
          ref: String(cursor?.sinceMs ?? "initial"),
          reason: "invalid-response",
          retryable: true,
          detail: "response did not contain PGN",
        },
      ],
      cursor,
      complete: false,
    };
  }

  const games: SyncResult["games"] = [];
  const failures: SyncFailure[] = [];
  let latestPlayedAt = cursor?.sinceMs ?? null;
  let cursorAdvancing = true;

  for (const chunk of splitPgnGames(text)) {
    const variant = chunk.match(VARIANT_TAG)?.[1];
    if (variant && variant !== "Standard") {
      failures.push({
        scope: "game",
        ref: chunk.match(GAME_ID_TAG)?.[1] ?? "unknown",
        reason: "unsupported-variant",
        retryable: false,
        detail: variant,
      });
      continue;
    }

    const externalId = chunk.match(GAME_ID_TAG)?.[1] ?? null;
    const externalUrl = chunk.match(SITE_TAG)?.[1] ?? null;
    const result = normalizeGame(chunk, { origin: "lichess", externalId, externalUrl });

    if (isSyncFailure(result)) {
      failures.push(result);
      cursorAdvancing = false;
      continue;
    }

    games.push(result);
    if (cursorAdvancing && result.playedAt) {
      latestPlayedAt = result.playedAt.getTime() + 1;
    }
  }

  const nextCursor = latestPlayedAt !== null ? { sinceMs: latestPlayedAt } : cursor;
  return { games, failures, cursor: nextCursor, complete: failures.length === 0 };
}
