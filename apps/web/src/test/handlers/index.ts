import { http, HttpResponse } from "msw";

import { accountsHandlers } from "./accounts.ts";
import { authHandlers } from "./auth.ts";
import { drillHandlers } from "./drill.ts";
import { gamesHandlers } from "./games.ts";
import { insightsHandlers } from "./insights.ts";
import { overviewHandlers } from "./overview.ts";
import { repertoiresHandlers } from "./repertoires.ts";

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
  ...drillHandlers,
  ...insightsHandlers,
  ...overviewHandlers,
  ...repertoiresHandlers,
];
