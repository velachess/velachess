import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";

import { SYNC_SETTLED_EVENTS, watchSyncs } from "@velachess/accounts";
import type { WatchSyncsDeps } from "@velachess/accounts";

import type { ApiEnv } from "../server.ts";
import { defaultHook } from "../validation.ts";

const watchSyncsRoute = createRoute({
  method: "get",
  path: "/events",
  summary: "The caller's syncs as they settle, over Server-Sent Events",
  description:
    "A plain GET, so any EventSource client opens it directly. One stream per session, not per job: it announces every sync of the signed-in user that reaches a terminal state while it is open.\n\nEvents: `sync.completed` or `sync.failed`, the frame `id` set to the sync id, with `{ syncId, accountId, gamesInserted }`. No event is named `error`: that name collides with the one EventSource itself fires on transport failure. Sends `: keep-alive` comments so proxies do not close an idle stream, and `X-Accel-Buffering: no` so nginx does not buffer it.\n\nNot a record: a notification the server was not listening for is never replayed, and the stream ends when the server's own listener reconnects. A client that reconnects reads its accounts and games again from GET /accounts, which is the only authority on a sync.",
  responses: {
    200: {
      description: "Event stream, open until the client leaves or the listener resets",
      content: { "text/event-stream": { schema: { type: "string" } } },
    },
  },
});

/** Before a proxy assumes a quiet stream died. */
const HEARTBEAT_MS = 15_000;

export function syncsRoutes(deps: { watch: WatchSyncsDeps }) {
  return new OpenAPIHono<ApiEnv>({ defaultHook }).openapi(watchSyncsRoute, (c) => {
    c.header("X-Accel-Buffering", "no");

    // Subscribed before the response leaves, so a client refreshing its
    // queries once the stream opens cannot miss a sync settling in
    // between.
    const settled = watchSyncs(deps.watch, c.get("userId"), c.req.raw.signal);

    return streamSSE(c, async (stream) => {
      const heartbeat = setInterval(() => {
        if (!stream.aborted) void stream.write(": keep-alive\n\n").catch(() => {});
      }, HEARTBEAT_MS);
      stream.onAbort(() => clearInterval(heartbeat));
      try {
        for await (const sync of settled) {
          await stream.writeSSE({
            event:
              sync.status === "succeeded"
                ? SYNC_SETTLED_EVENTS.completed
                : SYNC_SETTLED_EVENTS.failed,
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
  });
}
