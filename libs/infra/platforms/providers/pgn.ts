/**
 * Pasted or uploaded PGN — no sniffing, no auto-detection. This provider is
 * only ever invoked when the caller already knows it's a paste/upload
 * (every OSS project studied confirms this is a universal, explicit,
 * user-driven choice, never content-guessed).
 */

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import type { NormalizedGame, Perspective, SyncFailure, SyncResult } from "../schema.ts";
import { splitPgnGames } from "../split.ts";

/**
 * How the uploader identified themselves across the whole batch. "white"
 * and "black" apply to every game, no header check — the user is asserting
 * it, not describing it. "byName" keeps the original per-game header match.
 */
export type Participation =
  | { mode: "white" }
  | { mode: "black" }
  | { mode: "byName"; playerName: string };

export interface ImportPgnOptions {
  participation?: Participation | undefined;
}

/** Case-insensitive header match: PGN names are free text, not handles. */
function sideOf(game: NormalizedGame, playerName: string): Perspective | null {
  const name = playerName.trim().toLowerCase();
  if (!name) return null;
  if (game.white.name.trim().toLowerCase() === name) return "white";
  if (game.black.name.trim().toLowerCase() === name) return "black";
  return null;
}

/** Resolves perspective per game — forced modes skip the headers entirely. */
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
