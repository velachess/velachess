import { sql } from "drizzle-orm";

import { games, trackedAccounts } from "../schema.ts";

/**
 * Which side was you, decided in SQL.
 *
 * `games.perspective` carries what a manual PGN import resolved. A synced
 * game stores null — the normalizer sees a PGN, not an identity — so for
 * those the seat is derived by matching the provenance account's username
 * against the player names. Same rule as `resolveGamePerspective` in
 * `@velachess/chess`, which is what every caller outside SQL uses.
 *
 * The account join this reads is a LEFT join and may be absent (a pasted
 * PGN has none): a NULL username makes both comparisons NULL, so such a
 * game answers from the stored column alone, or stays null. Null is a
 * fact — an unattributed game — not a gap to paper over.
 *
 * Every read that hands a game's seat to a caller has to apply this.
 * Returning the raw column instead silently reports "unknown" for every
 * synced game, and the screen downstream then guesses: that is how the
 * review board came to seat the opponent at the bottom.
 */
export const perspectiveSql = sql<"white" | "black" | null>`coalesce(
  ${games.perspective}::text,
  case
    when lower(${games.whiteName}) = lower(${trackedAccounts.username}) then 'white'
    when lower(${games.blackName}) = lower(${trackedAccounts.username}) then 'black'
  end
)`;
