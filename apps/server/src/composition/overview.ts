/**
 * Composition root for the overview module: adapts the DB client every
 * route already carries into the four narrow readers get-overview
 * declared. Routes and get-overview never see a Database value.
 */
import {
  countDueCards,
  countExercises,
  countGames,
  countOwnDeviations,
} from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type { GetOverviewDeps } from "@velachess/overview";

export function buildOverviewDeps(db: Database): GetOverviewDeps {
  return {
    countGames: (userId) => countGames(db, userId),
    countDeviations: (userId) => countOwnDeviations(db, userId),
    countExercises: (userId) => countExercises(db, userId),
    countDueCards: (userId, now) => countDueCards(db, userId, now),
  };
}
