import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { listDeviationsForUser, type ListDeviationsDeps } from "@velachess/deviations";

import type { ApiEnv } from "../server.ts";
import { defaultHook } from "../validation.ts";

/** Mirrors `@velachess/deviations`' `listDeviationsForUser` result —
 * `DeviationRow` minus `positionKey`, plus `fen`. `playedAt` travels as ISO
 * text on the wire, not a `Date`. `chapterName` is nullable here (the real
 * type), unlike the old hand-written doc, which had it as a required
 * string — one of the confirmed drift examples this migration fixes. */
const deviationSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  ply: z.number().int().nullable(),
  playedSan: z.string().nullable(),
  expectedSans: z.array(z.string()).nullable(),
  fen: z.string().nullable(),
  cpLoss: z.number().int().nullable(),
  engineCategory: z.string().nullable(),
  drillable: z.boolean(),
  drilled: z.boolean(),
  repertoireName: z.string(),
  chapterName: z.string().nullable(),
  whiteName: z.string(),
  blackName: z.string(),
  result: z.string(),
  playedAt: z.string().nullable(),
  openingName: z.string().nullable(),
  gameUrl: z.string().nullable(),
});

const listDeviationsRoute = createRoute({
  method: "get",
  path: "/",
  summary: "The user's own deviations, engine verdict and game context included",
  description:
    "One row per own-move deviation: what was played vs what the book expected, the engine's severity, repertoire/chapter attribution (snapshots survive deletion), the game it came from, a playable FEN of the position, and whether an exercise was already seeded from it.",
  responses: {
    200: {
      description: "Deviations, newest games first",
      content: { "application/json": { schema: z.array(deviationSchema) } },
    },
  },
});

export function deviationsRoutes(deps: ListDeviationsDeps) {
  return new OpenAPIHono<ApiEnv>({ defaultHook }).openapi(
    listDeviationsRoute,
    async (c) => {
      const rows = await listDeviationsForUser(deps, c.get("userId"));
      return c.json(
        rows.map((row) =>
          Object.assign({}, row, { playedAt: row.playedAt?.toISOString() ?? null }),
        ),
        200,
      );
    },
  );
}
