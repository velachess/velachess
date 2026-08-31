import { Hono } from "hono";

import { getOverview, type GetOverviewDeps } from "@velachess/overview";

import type { ApiEnv } from "../server.ts";

/**
 * Current-state counts (games, deviations, exercises, cards due) — not
 * history, which is why this isn't `/insights`.
 */
export function overviewRoutes(deps: GetOverviewDeps) {
  return new Hono<ApiEnv>().get("/", async (c) =>
    c.json(await getOverview(deps, c.get("userId"))),
  );
}
