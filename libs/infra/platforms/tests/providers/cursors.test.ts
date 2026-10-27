import { describe, expect, it } from "vitest";

import {
  chessComCursorSchema,
  fetchChessCom,
  fetchLichess,
  lichessCursorSchema,
} from "@velachess/infra-platforms";
import { CHESS_COM_ARCHIVES_INDEX, CHESS_COM_ARCHIVE_MONTH } from "@velachess/fixtures";

const chessComArchive: typeof globalThis.fetch = async (url) => {
  const href = String(url);
  if (href.endsWith("/games/archives"))
    return new Response(JSON.stringify(CHESS_COM_ARCHIVES_INDEX));
  if (href.endsWith("/2024/01"))
    return new Response(JSON.stringify(CHESS_COM_ARCHIVE_MONTH));
  return new Response(JSON.stringify({ games: [] }));
};

/**
 * One `jsonb` column stores both cursors, so the column cannot say which
 * shape it holds. These check the two properties a reader depends on: a
 * cursor a provider just produced parses back under its own schema, and the
 * sibling's shape does not.
 */
describe("cursor schemas", () => {
  it("round-trips the cursor fetchChessCom produces", async () => {
    const { cursor } = await fetchChessCom("test-player", null, {
      fetch: chessComArchive,
    });

    expect(cursor).not.toBeNull();
    expect(chessComCursorSchema.safeParse(cursor).success).toBe(true);
  });

  it("round-trips the cursor fetchLichess produces", async () => {
    const pgn = [
      '[Event "Rated blitz game"]',
      '[Site "https://lichess.org/abcd1234"]',
      '[GameId "abcd1234"]',
      '[UTCDate "2024.01.01"]',
      '[UTCTime "12:00:00"]',
      '[White "arex"]',
      '[Black "someone"]',
      '[Result "1-0"]',
      '[TimeControl "180+0"]',
      "",
      "1. e4 e5 2. Nf3 1-0",
      "",
    ].join("\n");
    const fetch: typeof globalThis.fetch = async () => new Response(pgn);

    const { cursor } = await fetchLichess("arex", null, { fetch });

    expect(cursor).not.toBeNull();
    expect(lichessCursorSchema.safeParse(cursor).success).toBe(true);
  });

  it("rejects the sibling provider's shape", () => {
    expect(chessComCursorSchema.safeParse({ sinceMs: 1_704_067_200_000 }).success).toBe(
      false,
    );
    expect(
      lichessCursorSchema.safeParse({ month: "2024/01", lastEndTime: 1 }).success,
    ).toBe(false);
  });

  it("rejects everything a jsonb column can also hold", () => {
    for (const value of [{}, { x: 1 }, "2024/01", 5, [], true]) {
      expect(chessComCursorSchema.safeParse(value).success).toBe(false);
      expect(lichessCursorSchema.safeParse(value).success).toBe(false);
    }
  });
});
