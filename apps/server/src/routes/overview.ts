import { Hono } from "hono";

import { getOverview } from "@velachess/application/overview/get-overview/get-overview";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";

/**
 * Current-state counts (games, deviations, exercises, cards due) — not
 * history, which is why this isn't `/insights`.
 */
export function overviewRoutes(deps: ApiDeps) {
  return new Hono<ApiEnv>().get("/", async (c) =>
    c.json(await getOverview(deps.db, c.get("userId"))),
  );
}
