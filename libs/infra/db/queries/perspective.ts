import { sql } from "drizzle-orm";

import { games, trackedAccounts } from "../schema.ts";

/**
 * `resolveGamePerspective` from `@velachess/chess`, in SQL: the column
 * carries what a manual import resolved, and a synced game's null seat is
 * derived by matching the provenance account's username against the player
 * names.
 *
 * The account join is LEFT and may be absent, in which case a NULL username
 * makes both comparisons NULL and the game answers from its stored column
 * alone. Null is a fact, an unattributed game.
 *
 * Every read that hands a seat to a caller applies this: returning the raw
 * column reports "unknown" for every synced game, which is how the review
 * board came to seat the opponent at the bottom.
 */
export const perspectiveSql = sql<"white" | "black" | null>`coalesce(
  ${games.perspective}::text,
  case
    when lower(${games.whiteName}) = lower(${trackedAccounts.username}) then 'white'
    when lower(${games.blackName}) = lower(${trackedAccounts.username}) then 'black'
  end
)`;
