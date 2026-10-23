/**
 * The open `GET /api/syncs/events` streams, as the server holds them: the
 * archive writes a frame when a sync lands, and a test closes them to see
 * the client come back. Apart from the msw handler, so the archive can
 * announce without importing msw.
 */

import type { SYNC_SETTLED_EVENT_NAMES } from "../games/import/index.ts";

type Controller = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();
const streams = new Set<Controller>();

/** Stays open until dropped, never closed by the handler. */
export function openSyncStream(): ReadableStream<Uint8Array> {
  let controller: Controller;
  return new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      streams.add(ctrl);
    },
    cancel() {
      streams.delete(controller);
    },
  });
}

export function openSyncStreams(): number {
  return streams.size;
}

/** The frame the real route writes once a job settles. */
export function announceSync(
  event: (typeof SYNC_SETTLED_EVENT_NAMES)[number],
  job: { id: string; accountId: string; gamesInserted: number | null },
): void {
  const frame = `event: ${event}\nid: ${job.id}\ndata: ${JSON.stringify({
    syncId: job.id,
    accountId: job.accountId,
    gamesInserted: job.gamesInserted,
  })}\n\n`;
  for (const stream of streams) stream.enqueue(encoder.encode(frame));
}

/** As a server resetting its listener does. */
export function dropSyncStreams(): void {
  for (const stream of streams) stream.close();
  streams.clear();
}
