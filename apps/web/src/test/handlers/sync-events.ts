import { http, HttpResponse } from "msw";

import { openSyncStream } from "../sync-stream.ts";

/** The session's one sync stream. Frames come from the archive, when a job lands. */
export const syncEventsHandlers = [
  http.get(
    "/api/syncs/events",
    () =>
      new HttpResponse(openSyncStream(), {
        headers: { "Content-Type": "text/event-stream" },
      }),
  ),
];
