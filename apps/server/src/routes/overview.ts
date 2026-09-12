import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { getOverview, type GetOverviewDeps } from "@velachess/overview";

import type { ApiEnv } from "../server.ts";
import { defaultHook } from "../validation.ts";

/** Mirrors `@velachess/overview`'s `Overview`. */
const overviewSchema = z.object({
  games: z.number().int(),
  deviations: z.number().int(),
  exercises: z.number().int(),
  dueCards: z.number().int(),
});

const getOverviewRoute = createRoute({
  method: "get",
  path: "/",
  summary: "Current-state counters for the dashboard",
  responses: {
    200: {
      description: "Games, deviations, exercises, and cards due right now",
      content: { "application/json": { schema: overviewSchema } },
    },
  },
});

/**
 * Current-state counts (games, deviations, exercises, cards due) — not
 * history, which is why this isn't `/insights`.
 */
export function overviewRoutes(deps: GetOverviewDeps) {
  return new OpenAPIHono<ApiEnv>({ defaultHook }).openapi(getOverviewRoute, async (c) =>
    c.json(await getOverview(deps, c.get("userId")), 200),
  );
}
