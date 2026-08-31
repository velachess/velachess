import { Hono } from "hono";

import { listInsights, type GetInsightsDeps } from "@velachess/insights";

import type { ApiEnv } from "../server.ts";

/**
 * Cross-game patterns a single game report can't surface. Returns ranked
 * findings, not raw tables — an empty array is a valid, common answer.
 */
export function insightsRoutes(deps: GetInsightsDeps) {
  return new Hono<ApiEnv>().get("/", async (c) =>
    c.json(await listInsights(deps, c.get("userId"))),
  );
}
