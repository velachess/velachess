/** The never-scheduled pile: exercises with no card yet. */
import { and, eq, notExists } from "drizzle-orm";

import type { Database, DrillScope } from "@velachess/db";
import { drillScopeCondition, schema } from "@velachess/db";

const { cards, exercises } = schema;

/** An exercise that has never been scheduled — the "learn something new"
 * pick when nothing is due. `scope` narrows the pile the same way it
 * narrows the due queue. */
export async function getNewExercise(
  db: Database,
  userId: string,
  scope: DrillScope = {},
) {
  const [exercise] = await db
    .select()
    .from(exercises)
    .where(
      and(
        eq(exercises.userId, userId),
        notExists(
          db
            .select({ one: cards.id })
            .from(cards)
            .where(eq(cards.exerciseId, exercises.id)),
        ),
        drillScopeCondition(db, scope),
      ),
    )
    .limit(1);
  return exercise ?? null;
}
