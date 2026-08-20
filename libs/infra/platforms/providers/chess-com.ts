/**
 * Chess.com's Published-Data API — public, no auth. Sequential requests
 * only: parallel requests are documented to trigger 429s. Starts from the
 * real archives index rather than guessing a month window, so there's no
 * "just crossed a month boundary, archive looks empty" gap to patch around.
 */

import { z } from "zod";

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import type { FetchFn, SyncFailure, SyncResult } from "../schema.ts";

export interface ChessComCursor {
  /** "YYYY/MM" of the last archive month fully synced. */
  month: string;
  /** end_time (unix seconds) of the last game seen in that month. */
  lastEndTime: number;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;
const USER_AGENT = "velachess-ingest (+https://github.com/yurimutti/velachess)";

const archivesIndexSchema = z.object({ archives: z.array(z.string()) });

const gameSchema = z.object({
  url: z.string(),
  pgn: z.string().optional(),
  rules: z.string(),
  end_time: z.number(),
});

const monthResponseSchema = z.object({ games: z.array(gameSchema) });

/** A year of archives on a first sync — a single month starves insights
 * (trend windows, per-opening samples); the cursor limits later syncs. */
const DEFAULT_BOOTSTRAP_MONTHS = 12;

function monthOf(archiveUrl: string): string {
  const parts = archiveUrl.split("/");
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

export async function fetchChessCom(
  username: string,
  cursor: ChessComCursor | null,
  opts: { fetch?: FetchFn } = {},
): Promise<SyncResult & { cursor: ChessComCursor | null }> {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`Invalid Chess.com username: "${username}"`);
  }
  const doFetch = opts.fetch ?? globalThis.fetch;
  const headers = { Accept: "application/json", "User-Agent": USER_AGENT };

  const indexRes = await doFetch(
    `https://api.chess.com/pub/player/${username}/games/archives`,
    { headers },
  );
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

  const games: SyncResult["games"] = [];
  const failures: SyncFailure[] = [];
  let nextCursor = cursor;
  let cursorAdvancing = true;

  for (const archiveUrl of months) {
    const month = monthOf(archiveUrl);
    const monthRes = await doFetch(archiveUrl, { headers });

    if (!monthRes.ok) {
      failures.push({
        scope: "archive-month",
        ref: month,
        reason: "http-error",
        retryable: true,
        detail: `HTTP ${monthRes.status}`,
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
      // In-progress daily games have no `pgn` yet — not an error, just not ready.
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
    } else {
      cursorAdvancing = false;
    }
  }

  return { games, failures, cursor: nextCursor, complete: failures.length === 0 };
}
