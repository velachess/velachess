import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";

import { getSync, watchSyncs } from "@velachess/accounts";
import type { GetSyncDeps, WatchSyncsDeps } from "@velachess/accounts";

import type { ApiEnv } from "../server.ts";
import {
  defaultHook,
  errorResponseSchema,
  idParamSchema,
  wireDateOrNull,
} from "../validation.ts";

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

/** The serializer, built from the schema above with `.extend()` so only
 * the timestamps are restated. See `wireDate` for why the schema performs
 * the conversion instead of the handler. */
const syncJobWire = syncJobSchema.extend({
  startedAt: wireDateOrNull,
  finishedAt: wireDateOrNull,
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

const watchSyncsRoute = createRoute({
  method: "get",
  path: "/events",
  summary: "The caller's syncs as they settle, over Server-Sent Events",
  description:
    "A plain GET, so any EventSource client opens it directly. One stream per session, not per job: it announces every sync of the signed-in user that reaches a terminal state while it is open.\n\nEvents: `sync.completed` or `sync.failed`, the frame `id` set to the sync id, with `{ syncId, accountId, gamesInserted }`. No event is named `error`: that name collides with the one EventSource itself fires on transport failure. Sends `: keep-alive` comments so proxies do not close an idle stream, and `X-Accel-Buffering: no` so nginx does not buffer it.\n\nNot a record: a notification the server was not listening for is never replayed, and the stream ends when the server's own listener reconnects. A client that reconnects refreshes its accounts and games from the persisted rows, which are the only authority on a sync.",
  responses: {
    // Not a Zod/JSON response — SSE is a plain literal schema, the same
    // arrangement the analysis stream makes in routes/games.ts.
    200: {
      description: "Event stream, open until the client leaves or the listener resets",
      content: { "text/event-stream": { schema: { type: "string" } } },
    },
  },
});

/** Namespaced, past-tense event names, like the analysis stream's. */
const STREAM_EVENTS = { completed: "sync.completed", failed: "sync.failed" } as const;

/** How long a quiet stream may stay quiet before a proxy assumes it died. */
const HEARTBEAT_MS = 15_000;

export function syncsRoutes(deps: { get: GetSyncDeps; watch: WatchSyncsDeps }) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // Before `/{id}`: that route validates its param as a uuid, and
      // `events` is not one.
      /**
       * Plain SSE over the process's one LISTEN. The slice resolves every
       * signal against the row and keeps only the caller's; this only maps
       * what it yields onto frames.
       */
      .openapi(watchSyncsRoute, (c) => {
        // See routes/games.ts: proxies buffer a stream into a hang.
        c.header("X-Accel-Buffering", "no");

        // Subscribed before the response leaves. A client that refreshes
        // its queries once the stream opens cannot miss a sync that settles
        // between that refresh and this subscription.
        const settled = watchSyncs(deps.watch, c.get("userId"), c.req.raw.signal);

        return streamSSE(c, async (stream) => {
          const heartbeat = setInterval(() => {
            if (!stream.aborted) void stream.write(": keep-alive\n\n").catch(() => {});
          }, HEARTBEAT_MS);
          stream.onAbort(() => clearInterval(heartbeat));
          try {
            for await (const sync of settled) {
              // oxlint-disable-next-line eslint/no-await-in-loop
              await stream.writeSSE({
                event:
                  sync.status === "succeeded"
                    ? STREAM_EVENTS.completed
                    : STREAM_EVENTS.failed,
                id: sync.syncId,
                data: JSON.stringify({
                  syncId: sync.syncId,
                  accountId: sync.accountId,
                  gamesInserted: sync.gamesInserted,
                }),
              });
            }
          } finally {
            clearInterval(heartbeat);
          }
        });
      })
      .openapi(getSyncRoute, async (c) => {
        const job = await getSync(deps.get, c.get("userId"), c.req.valid("param").id);
        if (!job) return c.json({ error: "sync not found" }, 404);

        return c.json(
          syncJobWire.parse({
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
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
          }),
          200,
        );
      })
  );
}
