/**
 * Someone else's account id answers `not-found`, like an id that never
 * existed.
 *
 * The games the connection brought in go with it: they cannot be read
 * properly once the account is gone, the seat being derived by joining it.
 * A pasted PGN has no account and is never touched.
 *
 * Deleting clears the `(user_id, platform)` slot, so reconnecting any
 * handle on that provider afterwards is a plain `importAccount` call.
 */
import type { TrackedAccount } from "@velachess/infra-db";

type GetTrackedAccountForUser = (
  userId: string,
  accountId: string,
) => Promise<TrackedAccount | null>;
/** The connection and the games it produced leave together. */
type DeleteAccountAndItsGames = (accountId: string) => Promise<void>;

export interface DisconnectAccountDeps {
  getTrackedAccountForUser: GetTrackedAccountForUser;
  deleteAccountAndItsGames: DeleteAccountAndItsGames;
}

export type DisconnectOutcome = { status: "deleted" } | { status: "not-found" };

export async function disconnectAccount(
  deps: DisconnectAccountDeps,
  userId: string,
  accountId: string,
): Promise<DisconnectOutcome> {
  const account = await deps.getTrackedAccountForUser(userId, accountId);
  if (!account) return { status: "not-found" };

  await deps.deleteAccountAndItsGames(accountId);
  return { status: "deleted" };
}
