import { http, HttpResponse } from "msw";

import { accountsHandlers } from "./accounts.ts";
import { authHandlers } from "./auth.ts";
import { gamesHandlers } from "./games.ts";

/**
 * The network as it behaves when nothing has gone wrong, grouped by the
 * route file each group mirrors.
 *
 * Only happy paths live here. A failure a test needs — a 500, a timeout,
 * an account that disappeared — is a `server.use()` override inside that
 * test, so the failure is visible next to the assertion that depends on
 * it instead of hidden in shared setup.
 */
export const handlers = [
  http.get("/api/health", () => HttpResponse.json({ ok: true })),
  ...authHandlers,
  ...gamesHandlers,
  ...accountsHandlers,
];
