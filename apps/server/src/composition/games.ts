/**
 * Composition root for the games module: adapts the DB client every route
 * already carries into the narrow readers/writers each games route's
 * slice declared. Routes never see a Database value directly.
 */
import { getGameForUser, listGamesPage, saveGames } from "@velachess/infra-db";
import type { Database } from "@velachess/infra-db";
import type { GetGameDeps, ImportPgnDeps, ListGamesDeps } from "@velachess/games";

export function buildGetGameDeps(db: Database): GetGameDeps {
  return {
    getGameForUser: (userId, gameId) => getGameForUser(db, userId, gameId),
  };
}

export function buildListGamesDeps(db: Database): ListGamesDeps {
  return {
    listGamesPage: (userId, filters, page) => listGamesPage(db, userId, filters, page),
  };
}

export function buildImportPgnDeps(db: Database): ImportPgnDeps {
  return {
    saveGames: (games, userId) => saveGames(db, games, { userId }),
  };
}
