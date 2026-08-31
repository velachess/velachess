/**
 * ListAccountGames — one tracked handle's games with judgment type and
 * analysis presence, the read model the account screen renders.
 */
import type { TrackedAccount } from "@velachess/infra-db";

type GetTrackedAccountForUser = (
  userId: string,
  accountId: string,
) => Promise<TrackedAccount | null>;

export interface GameWithStatus {
  id: string;
  whiteName: string;
  blackName: string;
  result: string;
  playedAt: Date | null;
  perspective: string | null;
  openingName: string | null;
  judgmentType: string | null;
  judgmentPly: number | null;
  analyzed: boolean;
}

type ListGamesWithStatusForAccount = (accountId: string) => Promise<GameWithStatus[]>;

export interface ListAccountGamesDeps {
  getTrackedAccountForUser: GetTrackedAccountForUser;
  listGamesWithStatusForAccount: ListGamesWithStatusForAccount;
}

/**
 * Scoped by owner: someone else's account id and a missing one are the
 * same null, so a caller never confirms which uuids exist. The join and
 * its ordering live in `@velachess/infra-db`'s
 * `listGamesWithStatusForAccount`; this slice only enforces ownership.
 */
export async function listGamesWithStatus(
  deps: ListAccountGamesDeps,
  userId: string,
  accountId: string,
) {
  const account = await deps.getTrackedAccountForUser(userId, accountId);
  if (!account) return null;

  return deps.listGamesWithStatusForAccount(account.id);
}
