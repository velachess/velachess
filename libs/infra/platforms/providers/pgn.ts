/**
 * No sniffing: this provider runs only when the caller already knows it has
 * a paste, which is always an explicit user choice.
 */

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import type { NormalizedGame, Perspective, SyncFailure, SyncResult } from "../schema.ts";
import { splitPgnGames } from "../split.ts";

/**
 * "white" and "black" apply to every game with no header check, the user
 * asserting rather than describing; "byName" matches each game's headers.
 */
export type Participation =
  | { mode: "white" }
  | { mode: "black" }
  | { mode: "byName"; playerName: string };

export interface ImportPgnOptions {
  participation?: Participation | undefined;
}

/** Case-insensitive: PGN names are free text, not handles. */
function sideOf(game: NormalizedGame, playerName: string): Perspective | null {
  const name = playerName.trim().toLowerCase();
  if (!name) return null;
  if (game.white.name.trim().toLowerCase() === name) return "white";
  if (game.black.name.trim().toLowerCase() === name) return "black";
  return null;
}

/** A forced mode skips the headers entirely. */
function resolveParticipation(
  game: NormalizedGame,
  participation: Participation,
): Perspective | null {
  switch (participation.mode) {
    case "white":
      return "white";
    case "black":
      return "black";
    case "byName":
      return sideOf(game, participation.playerName);
  }
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
      options.participation
        ? { ...result, perspective: resolveParticipation(result, options.participation) }
        : result,
    );
  }

  return { games, failures, cursor: null, complete: failures.length === 0 };
}
