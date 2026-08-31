/**
 * Composition root for the insights module: adapts the DB client every
 * route already carries into the one raw read `get-insights` declared,
 * plus repertoires' own narrow adherence adapter, narrowed further to the
 * two fields this source reads. Routes never see a Database value.
 */
import { listGamesForInsights } from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import { listRepertoiresWithAdherence } from "@velachess/repertoires";
import type { GetInsightsDeps } from "@velachess/insights";

import { buildListRepertoiresDeps } from "./repertoires.ts";

export function buildInsightsDeps(db: Database): GetInsightsDeps {
  const listRepertoiresDeps = buildListRepertoiresDeps(db);

  return {
    fetchInsightGameRows: (userId) => listGamesForInsights(db, userId),
    listRepertoiresWithAdherence: async (userId) => {
      const repertoires = await listRepertoiresWithAdherence(listRepertoiresDeps, userId);
      return repertoires.map((repertoire) => ({
        id: repertoire.id,
        name: repertoire.name,
        color: repertoire.color,
        adherence: repertoire.adherence,
      }));
    },
  };
}
