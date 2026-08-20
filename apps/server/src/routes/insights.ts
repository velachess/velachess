import { Hono } from "hono";

import { listInsights } from "@velachess/application/insights/get-insights/get-insights";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";

/**
 * Cross-game patterns a single game report can't surface. Returns ranked
 * findings, not raw tables — an empty array is a valid, common answer.
 */
export function insightsRoutes(deps: ApiDeps) {
  return new Hono<ApiEnv>().get("/", async (c) =>
    c.json(await listInsights(deps.db, c.get("userId"))),
  );
}
