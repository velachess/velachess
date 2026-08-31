/**
 * BackfillOpeningNames — resolve opening names for historical games.
 *
 * Chess.com games commonly have [ECOUrl] with the name in the slug but
 * [Opening] was absent, leaving openingName = null in the database.
 * This one-shot migration resolves names from the URL for all such games.
 *
 * New games get the name at normalization time (libs/infra/platforms).
 * This slice handles the legacy data that predates that fix.
 *
 * Kept Database-first rather than narrow-deps: this is a one-shot data
 * backfill script with zero current consumers anywhere (confirmed by
 * repo-wide grep) — not wired into any route or worker, not exported
 * from games/index.ts. The narrow-contract ceremony buys nothing for code
 * nobody calls; preserved here, deferred, not deleted.
 */
import type { Database } from "@velachess/infra-db";
import { games } from "@velachess/infra-db";
import { openingNameFrom } from "@velachess/infra-platforms";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

export interface BackfillResult {
  updated: number;
}

export async function backfillOpeningNames(db: Database): Promise<BackfillResult> {
  const rows = await db
    .select({ id: games.id, openingUrl: games.openingUrl })
    .from(games)
    .where(and(isNull(games.openingName), isNotNull(games.openingUrl)));

  const updates: Promise<void>[] = [];
  for (const row of rows) {
    const name = openingNameFrom({ url: row.openingUrl });
    if (!name) continue;
    updates.push(
      db
        .update(games)
        .set({ openingName: name })
        .where(eq(games.id, row.id))
        .then(() => {}),
    );
  }

  await Promise.all(updates);

  return { updated: updates.length };
}
