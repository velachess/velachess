/**
 * Pasted or uploaded PGN — no sniffing, no auto-detection. This provider is
 * only ever invoked when the caller already knows it's a paste/upload
 * (every OSS project studied confirms this is a universal, explicit,
 * user-driven choice, never content-guessed).
 */

import { isSyncFailure, normalizeGame } from "../normalize.ts";
import { splitPgnGames } from "../split.ts";
import type { Perspective, SyncFailure, SyncResult } from "../schema.ts";

export interface ImportPgnOptions {
  /** Which side is "you", if the caller already knows. Never guessed here —
   * absent means every game in this text carries `perspective: null`. */
  perspective?: Perspective;
}

export function importPgn(text: string, options: ImportPgnOptions = {}): SyncResult {
  const games: SyncResult["games"] = [];
  const failures: SyncFailure[] = [];

  for (const [index, chunk] of splitPgnGames(text).entries()) {
    const result = normalizeGame(chunk, {
      origin: "pgn",
      externalId: null,
      externalUrl: null,
      perspective: options.perspective ?? null,
    });

    if (isSyncFailure(result)) {
      failures.push({ ...result, ref: `game-${index}` });
      continue;
    }
    games.push(result);
  }

  return { games, failures, cursor: null, complete: failures.length === 0 };
}
