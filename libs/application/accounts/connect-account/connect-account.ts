/**
 * ConnectAccount — start tracking a chess.com/Lichess handle.
 *
 * The only place a connection is created. First contact also fills the
 * archive (via the sync slice's fetch half), so a bad username fails in
 * front of the person who typed it.
 */
import type { Database } from "@velachess/db";
import { getTrackedAccount, upsertTrackedAccount } from "@velachess/db";

import { ensureCandidateRepertoires } from "../../repertoires/extract-repertoire/extract-repertoire.ts";
import type { SyncDeps } from "../sync-account/sync-account.ts";
import { syncAccount } from "../sync-account/sync-account.ts";

export type Platform = "chess_com" | "lichess";

/**
 * Start tracking a handle: create (or find) the user's connection to it,
 * and fill the archive on first contact.
 *
 * This is the WRITE half of what used to be one function. `openArchive`
 * previously upserted the account and seized its ownership on every
 * read — a GET that wrote, and the mechanism by which importing a
 * username another user tracked transferred their archive. Importing is
 * now something only this function does, and only for the caller.
 *
 * A bad username throws out of the provider here, which is the point:
 * the caller learns immediately instead of finding out later that a
 * background job gave up.
 */
export async function importAccount(
  db: Database,
  userId: string,
  platform: Platform,
  username: string,
  deps: SyncDeps = {},
) {
  const tracked = await upsertTrackedAccount(db, userId, platform, username);
  if (tracked.lastSyncedAt === null) {
    const outcome = await syncAccount(db, tracked.id, deps);
    // The first archive is also the first chance to derive a book, and
    // the person is watching: waiting for a later sync would show them
    // two empty sides right after an import that clearly had games.
    // Judging follows on the next pass or an explicit /games/judge.
    await ensureCandidateRepertoires(db, userId, { newGames: outcome.saved });
  }
  return (await getTrackedAccount(db, tracked.id))!;
}
