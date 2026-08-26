/**
 * Pasted or uploaded PGN — no sniffing, no auto-detection. This provider is
 * only ever invoked when the caller already knows it's a paste/upload
 * (every OSS project studied confirms this is a universal, explicit,
 * user-driven choice, never content-guessed).
 */

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import type { NormalizedGame, Perspective, SyncFailure, SyncResult } from "../schema.ts";
import { splitPgnGames } from "../split.ts";

export interface ImportPgnOptions {
  /**
   * The player these games belong to, as their name appears in the PGN
   * headers. Resolved per game against White/Black, so one file can mix
   * colors; a game naming them on neither side stays `perspective: null`
   * — present in the library, not attributable. Absent means every game
   * carries `perspective: null`. Never guessed here.
   */
  playerName?: string | undefined;
}

/** Case-insensitive header match: PGN names are free text, not handles. */
function sideOf(game: NormalizedGame, playerName: string): Perspective | null {
  const name = playerName.trim().toLowerCase();
  if (!name) return null;
  if (game.white.name.trim().toLowerCase() === name) return "white";
  if (game.black.name.trim().toLowerCase() === name) return "black";
  return null;
}

export function importPgn(text: string, options: ImportPgnOptions = {}): SyncResult {
  const games: SyncResult["games"] = [];
  const failures: SyncFailure[] = [];

  for (const [index, chunk] of splitPgnGames(text).entries()) {
    const result = normalizeGame(chunk, {
      origin: "pgn",
      externalId: null,
      externalUrl: null,
    });

    if (isSyncFailure(result)) {
      failures.push({ ...result, ref: `game-${index}` });
      continue;
    }
    games.push(
      options.playerName
        ? { ...result, perspective: sideOf(result, options.playerName) }
        : result,
    );
  }

  return { games, failures, cursor: null, complete: failures.length === 0 };
}
