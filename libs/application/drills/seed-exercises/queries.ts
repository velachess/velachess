/** The triage worklist: judged deviations with no exercise yet. */
import { and, eq, notExists } from "drizzle-orm";

import type { Database } from "@velachess/db";
import { schema } from "@velachess/db";

const { deviations, exerciseSources, repertoires } = schema;

/** Not filtered on engine verdict: requiring `engine_category` used to trap
 * deviations from games analysed before their repertoire existed. */
export async function listTriageCandidates(db: Database, userId: string) {
  return db
    .select({
      id: deviations.id,
      type: deviations.type,
      positionKey: deviations.positionKey,
      expectedSans: deviations.expectedSans,
    })
    .from(deviations)
    .innerJoin(repertoires, eq(deviations.repertoireId, repertoires.id))
    .where(
      and(
        eq(repertoires.userId, userId),
        notExists(
          db
            .select({ one: exerciseSources.deviationId })
            .from(exerciseSources)
            .where(eq(exerciseSources.deviationId, deviations.id)),
        ),
      ),
    );
}
