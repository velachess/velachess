/**
 * Chess.com's Published-Data API: public, and sequential only, parallel
 * requests being documented to trigger 429s. Starts from the real archives
 * index rather than guessing a month window, so crossing a month boundary
 * leaves no empty-looking archive.
 */

import { z } from "zod";

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import type { FetchFn, NormalizedGame, SyncFailure, SyncResult } from "../schema.ts";

/**
 * A schema rather than an interface because the value round-trips through a
 * `jsonb` column that also holds Lichess's cursor, which the column cannot
 * tell apart. See docs/explanation/data-boundaries.md.
 */
export const chessComCursorSchema = z.object({
  /** "YYYY/MM" of the last archive month fully synced. */
  month: z.string(),
  /** `end_time` in unix seconds of the last game seen that month. */
  lastEndTime: z.number(),
});
export type ChessComCursor = z.infer<typeof chessComCursorSchema>;

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;
/** Both providers ask that the client identify itself, and a block is
 * easier to lift with contact info in it. */
export const USER_AGENT = "velachess-ingest (+https://github.com/yurimutti/velachess)";

const archivesIndexSchema = z.object({ archives: z.array(z.string()) });

const gameSchema = z.object({
  url: z.string(),
  pgn: z.string().optional(),
  rules: z.string(),
  end_time: z.number(),
});

const monthResponseSchema = z.object({ games: z.array(gameSchema) });

/** A single month leaves little to review; the cursor bounds later
 * syncs. */
const DEFAULT_BOOTSTRAP_MONTHS = 12;

function monthOf(archiveUrl: string): string {
  const parts = archiveUrl.split("/");
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

export async function fetchChessCom(
  username: string,
  cursor: ChessComCursor | null,
  opts: {
    fetch?: FetchFn;
    signal?: AbortSignal;
    /** Fires once a month is fully normalized and never for one that
     * failed, so a crash mid-walk resumes from the last checkpointed month
     * rather than the pass's starting cursor. */
    onCheckpoint?: (
      cursor: ChessComCursor,
      monthGames: NormalizedGame[],
    ) => Promise<void>;
  } = {},
): Promise<SyncResult & { cursor: ChessComCursor | null }> {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`Invalid Chess.com username: "${username}"`);
  }
  const doFetch = opts.fetch ?? globalThis.fetch;
  const headers = { Accept: "application/json", "User-Agent": USER_AGENT };
  const init = opts.signal ? { headers, signal: opts.signal } : { headers };

  const indexRes = await doFetch(
    `https://api.chess.com/pub/player/${username}/games/archives`,
    init,
  );
  if (indexRes.status === 404) {
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
  if (!indexRes.ok) {
    throw new Error(
      `Chess.com returned no archives for "${username}" (${indexRes.status})`,
    );
  }
  const indexParsed = archivesIndexSchema.safeParse(await indexRes.json());
  if (!indexParsed.success) {
    throw new Error(
      `Chess.com archives response did not match the expected shape: ${indexParsed.error.message}`,
    );
  }

  const months = cursor
    ? indexParsed.data.archives.filter((url) => monthOf(url) >= cursor.month)
    : indexParsed.data.archives.slice(-DEFAULT_BOOTSTRAP_MONTHS);

  // Only the newest one: the index names the current month before its
  // archive exists, so that one 404s. An older month 404ing is a fault, and
  // skipping it would advance the cursor past games nobody fetched.
  const unpublished = indexParsed.data.archives.at(-1);

  const games: SyncResult["games"] = [];
  const failures: SyncFailure[] = [];
  let nextCursor = cursor;
  let cursorAdvancing = true;

  for (const archiveUrl of months) {
    const month = monthOf(archiveUrl);
    const monthStartIndex = games.length;
    const monthRes = await doFetch(archiveUrl, init);

    if (monthRes.status === 404 && archiveUrl === unpublished) continue;

    if (!monthRes.ok) {
      const retryAfter = monthRes.headers.get("Retry-After");
      failures.push({
        scope: "archive-month",
        ref: month,
        reason: monthRes.status === 429 ? "rate-limited" : "http-error",
        retryable: true,
        detail: `HTTP ${monthRes.status}${retryAfter ? ` (retry-after ${retryAfter}s)` : ""}`,
      });
      cursorAdvancing = false;
      continue;
    }

    const monthParsed = monthResponseSchema.safeParse(await monthRes.json());
    if (!monthParsed.success) {
      failures.push({
        scope: "archive-month",
        ref: month,
        reason: "invalid-response",
        retryable: true,
        detail: monthParsed.error.message,
      });
      cursorAdvancing = false;
      continue;
    }

    let maxEndTime = 0;
    let monthHadFailure = false;

    for (const game of monthParsed.data.games) {
      // In-progress daily games have no `pgn` yet.
      if (!game.pgn) continue;

      if (game.rules !== "chess") {
        failures.push({
          scope: "game",
          ref: game.url,
          reason: "unsupported-variant",
          retryable: false,
          detail: game.rules,
        });
        continue;
      }

      const externalId = game.url.split("/").pop() ?? game.url;
      const result = normalizeGame(game.pgn, {
        origin: "chess_com",
        externalId,
        externalUrl: game.url,
      });
      if (isSyncFailure(result)) {
        failures.push(result);
        monthHadFailure = true;
        continue;
      }

      games.push(result);
      maxEndTime = Math.max(maxEndTime, game.end_time);
    }

    if (cursorAdvancing && !monthHadFailure) {
      nextCursor = { month, lastEndTime: maxEndTime };
      await opts.onCheckpoint?.(nextCursor, games.slice(monthStartIndex));
    } else {
      cursorAdvancing = false;
    }
  }

  return { games, failures, cursor: nextCursor, complete: failures.length === 0 };
}
