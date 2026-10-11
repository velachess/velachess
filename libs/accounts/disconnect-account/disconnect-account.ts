/**
 * DisconnectAccount — stop tracking a chess.com/Lichess handle.
 *
 * Owner-scoped like `refreshAccount`: someone else's account id answers
 * `not-found`, same as an id that never existed.
 *
 * Removing a connection removes what it imported. The games it brought in
 * go with it (and their analyses with them) — a library that keeps
 * showing games from an account the user just disconnected is the bug
 * this answers, and those rows cannot even be read properly once their
 * account is gone: the seat the user played is derived by joining it.
 * Games the user imported as PGN have no account and are never touched.
 *
 * Deleting clears the `(user_id, platform)` slot, so reconnecting a
 * (possibly different) handle on that provider afterward is a plain
 * `importAccount` call, nothing special.
 */
import type { TrackedAccount } from "@velachess/infra-db";

type GetTrackedAccountForUser = (
  userId: string,
  accountId: string,
) => Promise<TrackedAccount | null>;
/** Named for what disconnecting means, not for the row it starts with:
 * the connection and the games it produced leave together. */
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
