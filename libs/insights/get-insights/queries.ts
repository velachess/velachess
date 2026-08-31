/** The one read: every game of the user's, with whatever analysis exists. */
import { resolveGamePerspective, type PerspectiveSource } from "@velachess/chess";
import { openingFamily } from "@velachess/infra-platforms";

import type { GameSample } from "./sample.ts";

/**
 * The raw row this slice's one broad read produces — oldest first, because
 * the trend source windows over time. The analysis rides along as a left
 * join in the real query — a game without one still counts for results and
 * openings, and its `plies` are honestly null rather than empty. So does
 * the provenance account: a synced game needs its username for perspective
 * derivation (see `PerspectiveSource`); a PGN import has none and stays.
 */
interface InsightGameRow extends PerspectiveSource {
  id: string;
  playedAt: Date | null;
  result: GameSample["result"];
  whiteRating: number | null;
  blackRating: number | null;
  openingName: string | null;
  openingUrl: string | null;
  openingEco: string | null;
  positions: GameSample["plies"];
}

/** Declared in this slice's own vocabulary — the composition root fits
 * the real infra-db query to this shape. */
export type FetchInsightGameRows = (userId: string) => Promise<InsightGameRow[]>;

export async function listInsightGames(
  fetchRows: FetchInsightGameRows,
  userId: string,
): Promise<GameSample[]> {
  const rows = await fetchRows(userId);

  return rows.map((row) => ({
    id: row.id,
    playedAt: row.playedAt,
    // Synced games store no perspective — only a pasted PGN declares
    // one. Every own-side calculation would silently count the whole
    // history as losses without this derivation.
    perspective: resolveGamePerspective(row),
    result: row.result,
    whiteRating: row.whiteRating,
    blackRating: row.blackRating,
    // The family, not the raw header: chess.com sends no `Opening` at
    // all (name is null on every game it imports), and Lichess's full
    // "Family: Variation" scatters one opening across buckets the
    // five-game floor can never fill. Derived at read time so history
    // imported before this existed is served without a re-import.
    openingName: openingFamily(row.openingName, row.openingUrl),
    openingEco: row.openingEco,
    plies: row.positions,
  }));
}
