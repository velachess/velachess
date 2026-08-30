/**
 * BackfillOpeningNames — resolve opening names for historical games.
 *
 * Chess.com games commonly have [ECOUrl] with the name in the slug but
 * [Opening] was absent, leaving openingName = null in the database.
 * This one-shot migration resolves names from the URL for all such games.
 *
 * New games get the name at normalization time (libs/infra/platforms).
 * This slice handles the legacy data that predates that fix.
 */
import { openingNameFrom } from "@velachess/chess";
import type { Database } from "@velachess/db";
import { games } from "@velachess/db";
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
