import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { getSync } from "@velachess/accounts";
import type { GetSyncDeps } from "@velachess/accounts";

import type { ApiEnv } from "../server.ts";
import { defaultHook, errorResponseSchema, idParamSchema } from "../validation.ts";

const syncJobSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  trigger: z.enum(["connect", "manual"]),
  status: z.enum(["queued", "running", "retrying", "succeeded", "failed"]),
  progress: z.object({
    unitsDone: z.null().describe("Reported once sync works in units"),
    unitsTotal: z.null().describe("Reported once sync works in units"),
    gamesFetched: z.number().int().nullable(),
    gamesInserted: z
      .number()
      .int()
      .nullable()
      .describe("New to the archive; fetched minus inserted is deduplication"),
  }),
  error: z
    .object({
      code: z.enum(["not-found", "incomplete", "internal"]),
      retryable: z.boolean(),
    })
    .nullable(),
  retryAfterSeconds: z.null(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

const getSyncRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "A sync job's status and progress",
  description:
    "Owner-scoped: someone else's job answers 404, like one that never existed. Poll while the status is queued, running or retrying.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The sync job",
      content: { "application/json": { schema: syncJobSchema } },
    },
    404: {
      description: "Unknown sync job",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

export function syncsRoutes(deps: { get: GetSyncDeps }) {
  return new OpenAPIHono<ApiEnv>({ defaultHook }).openapi(getSyncRoute, async (c) => {
    const job = await getSync(deps.get, c.get("userId"), c.req.valid("param").id);
    if (!job) return c.json({ error: "sync not found" }, 404);

    return c.json(
      {
        id: job.id,
        accountId: job.accountId,
        trigger: job.trigger,
        status: job.status,
        progress: {
          unitsDone: null,
          unitsTotal: null,
          gamesFetched: job.gamesFetched,
          gamesInserted: job.gamesInserted,
        },
        error: job.error,
        retryAfterSeconds: null,
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
      },
      200,
    );
  });
}
