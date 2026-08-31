import { Hono } from "hono";

import { listDeviationsForUser, type ListDeviationsDeps } from "@velachess/deviations";

import type { ApiEnv } from "../server.ts";

export function deviationsRoutes(deps: ListDeviationsDeps) {
  return new Hono<ApiEnv>().get("/", async (c) =>
    c.json(await listDeviationsForUser(deps, c.get("userId"))),
  );
}
