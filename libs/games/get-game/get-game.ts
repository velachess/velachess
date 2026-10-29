/** Scoped by owner: a stranger's id and a missing one are the same miss. */
import type { Game } from "@velachess/infra-db";

type GetGameForUser = (userId: string, gameId: string) => Promise<Game | null>;

export interface GetGameDeps {
  getGameForUser: GetGameForUser;
}

export async function getGameForReview(
  deps: GetGameDeps,
  userId: string,
  gameId: string,
): Promise<Game | null> {
  return deps.getGameForUser(userId, gameId);
}
