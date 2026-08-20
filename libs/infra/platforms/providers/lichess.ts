/**
 * Lichess's game-export API — public, no auth required (OAuth only raises
 * the rate-limit tier). Requests raw PGN directly (`Accept:
 * application/x-chess-pgn`) rather than NDJSON: verified live that this
 * returns clean multi-tag PGN text, so this provider reuses the exact same
 * split + normalize path as chess-com.ts and pgn.ts instead of parsing JSON.
 */

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import { splitPgnGames } from "../split.ts";
import type { FetchFn, SyncFailure, SyncResult } from "../schema.ts";

export interface LichessCursor {
  sinceMs: number;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,30}$/;
const PAGE_SIZE = 300;

const GAME_ID_TAG = /\[GameId "([^"]*)"\]/;
const SITE_TAG = /\[Site "([^"]*)"\]/;
const VARIANT_TAG = /\[Variant "([^"]*)"\]/;

export async function fetchLichess(
  username: string,
  cursor: LichessCursor | null,
  opts: { fetch?: FetchFn } = {},
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

  const res = await doFetch(`https://lichess.org/api/games/user/${username}?${params}`, {
    headers: { Accept: "application/x-chess-pgn" },
  });

  if (!res.ok) {
    const reason = res.status === 429 ? "rate-limited" : "http-error";
    return {
      games: [],
      failures: [
        {
          scope: "page",
          ref: String(cursor?.sinceMs ?? "initial"),
          reason,
          retryable: true,
          detail: `HTTP ${res.status}`,
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
