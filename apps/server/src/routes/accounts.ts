import { Hono } from "hono";
import { z } from "zod";

import {
  importAccount,
  listAccounts,
  listGamesWithStatus,
  refreshAccount,
} from "@velachess/accounts";
import type {
  ConnectAccountDeps,
  ListAccountGamesDeps,
  ListAccountsDeps,
  SyncAccountDeps,
} from "@velachess/accounts";

import type { ApiEnv } from "../server.ts";
import { validateIdParam, validateJson } from "../validation.ts";

const createAccountSchema = z.object({
  platform: z.enum(["chess_com", "lichess"]),
  username: z.string().min(1),
});

/** Narrow composed deps for this module's four slices — one field per
 * route, built by `apps/server/src/composition/accounts.ts`. */
export interface AccountsRouteDeps {
  list: ListAccountsDeps;
  games: ListAccountGamesDeps;
  connect: ConnectAccountDeps;
  sync: SyncAccountDeps;
}

export function accountsRoutes(deps: AccountsRouteDeps) {
  return (
    new Hono<ApiEnv>()
      // Delivery state travels with each account: `lastSyncedAt` says a pass
      // finished, `syncState` says whether one is still coming. A client that
      // saw only the timestamp couldn't tell "syncing" from "gave up".
      .get("/", async (c) => c.json(await listAccounts(deps.list, c.get("userId"))))
      // Importing is a POST, and the only place a connection is created.
      // Reads stopped writing ownership: the old flow let GET /games
      // upsert the account and seize it, which is how one user's archive
      // transferred to another. First contact also fills the archive, so
      // a bad username fails here, in front of the person who typed it.
      .post("/", validateJson(createAccountSchema), async (c) => {
        const { platform, username } = c.req.valid("json");
        const account = await importAccount(
          deps.connect,
          c.get("userId"),
          platform,
          username,
        );
        return c.json(
          {
            id: account.id,
            platform: account.platform,
            username: account.username,
          },
          201,
        );
      })
      // Interactive and synchronous, like importing: someone waiting on a
      // button needs an answer, and "nothing new" is an answer. The queue
      // stays for refreshes nobody is watching.
      .post("/:id/sync", validateIdParam, async (c) => {
        const outcome = await refreshAccount(
          deps.sync,
          c.get("userId"),
          c.req.valid("param").id,
        );

        if (outcome.status === "not-found")
          return c.json({ error: "account not found" }, 404);
        if (outcome.status === "too-soon") {
          // Retry-After is the header the status code is defined with; the
          // body repeats it so a client needn't read headers to show a countdown.
          c.header("Retry-After", String(outcome.retryAfterSeconds));
          return c.json(
            {
              error: "synced too recently",
              retryAfterSeconds: outcome.retryAfterSeconds,
            },
            429,
          );
        }

        return c.json({
          saved: outcome.saved,
          judged: outcome.judged,
          seeded: outcome.seeded,
        });
      })
      .get("/:id/games", validateIdParam, async (c) => {
        // Scoped lookup lives in the slice now: someone else's account id
        // 404s exactly like a missing one, so this route never confirms
        // which uuids exist.
        const games = await listGamesWithStatus(
          deps.games,
          c.get("userId"),
          c.req.valid("param").id,
        );
        if (!games) return c.json({ error: "account not found" }, 404);
        return c.json(games);
      })
  );
}
