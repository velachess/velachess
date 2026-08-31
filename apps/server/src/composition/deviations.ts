/**
 * Composition root for the deviations module: adapts the DB client every
 * route already carries into the one narrow reader list-deviations
 * declared.
 */
import { listOwnDeviations } from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type { ListDeviationsDeps } from "@velachess/deviations";

export function buildDeviationsDeps(db: Database): ListDeviationsDeps {
  return {
    listOwnDeviations: (userId) => listOwnDeviations(db, userId),
  };
}
