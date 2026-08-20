import { Hono } from "hono";

import { epdToFen } from "@velachess/chess";
import { listDeviationsForUser } from "@velachess/application/deviations/list-deviations/list-deviations";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";

export function deviationsRoutes(deps: ApiDeps) {
  return new Hono<ApiEnv>().get("/", async (c) => {
    const rows = await listDeviationsForUser(deps.db, c.get("userId"));
    // positionKey is an EPD; the board wants a playable FEN.
    return c.json(
      rows.map(({ positionKey, ...row }) =>
        Object.assign({}, row, {
          fen: positionKey ? epdToFen(positionKey) : null,
        }),
      ),
    );
  });
}
