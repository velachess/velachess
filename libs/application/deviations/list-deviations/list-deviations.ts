/**
 * ListDeviations — the user's own book-departures, newest first, with
 * enough context to render a row and a board.
 */
import { and, desc, eq, exists } from "drizzle-orm";

import type { Database } from "@velachess/db";
import { schema } from "@velachess/db";

const { deviations, exerciseSources, games } = schema;

/** The deviation table a UI renders: own deviations with the engine
 * verdict, repertoire attribution (snapshots survive deletion), the game
 * context, and whether an exercise was already seeded from it. */
export async function listDeviationsForUser(db: Database, userId: string) {
  return db
    .select({
      id: deviations.id,
      gameId: deviations.gameId,
      ply: deviations.ply,
      playedSan: deviations.playedSan,
      expectedSans: deviations.expectedSans,
      positionKey: deviations.positionKey,
      cpLoss: deviations.cpLoss,
      engineCategory: deviations.engineCategory,
      drillable: deviations.drillable,
      repertoireName: deviations.repertoireNameSnapshot,
      chapterName: deviations.chapterNameSnapshot,
      whiteName: games.whiteName,
      blackName: games.blackName,
      result: games.result,
      playedAt: games.playedAt,
      openingName: games.openingName,
      gameUrl: games.externalUrl,
      drilled: exists(
        db
          .select({ one: exerciseSources.deviationId })
          .from(exerciseSources)
          .where(eq(exerciseSources.deviationId, deviations.id)),
      ),
    })
    .from(deviations)
    .innerJoin(games, eq(deviations.gameId, games.id))
    .where(and(eq(games.userId, userId), eq(deviations.type, "deviation")))
    .orderBy(desc(games.playedAt));
}
