/**
 * DisconnectAccount — stop tracking a chess.com/Lichess handle.
 *
 * Owner-scoped like `refreshAccount`: someone else's account id answers
 * `not-found`, same as an id that never existed. Deleting the row does not
 * touch the games it brought in — `games.account_id` is `ON DELETE SET
 * NULL` at the schema level, so they stay in the user's library and only
 * lose their provenance link. Deleting clears the `(user_id, platform)`
 * slot, so reconnecting a (possibly different) handle on that provider
 * afterward is a plain `importAccount` call, nothing special.
 */
import type { TrackedAccount } from "@velachess/infra-db";

type GetTrackedAccountForUser = (
  userId: string,
  accountId: string,
) => Promise<TrackedAccount | null>;
type DeleteTrackedAccount = (accountId: string) => Promise<void>;

export interface DisconnectAccountDeps {
  getTrackedAccountForUser: GetTrackedAccountForUser;
  deleteTrackedAccount: DeleteTrackedAccount;
}

export type DisconnectOutcome = { status: "deleted" } | { status: "not-found" };

export async function disconnectAccount(
  deps: DisconnectAccountDeps,
  userId: string,
  accountId: string,
): Promise<DisconnectOutcome> {
  const account = await deps.getTrackedAccountForUser(userId, accountId);
  if (!account) return { status: "not-found" };

  await deps.deleteTrackedAccount(accountId);
  return { status: "deleted" };
}
