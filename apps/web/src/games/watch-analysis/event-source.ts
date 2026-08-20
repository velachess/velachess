import { EventSource } from "eventsource";

/** `EventSource` as an async iterable, closed exactly once. Uses `eventsource` (jsdom has no native, and native can't send auth headers); left open it self-reconnects (measured: 3x in 9s). */
/** `EventSource.CLOSED` — the source has stopped trying. */
const CLOSED = 2;

/** One SSE frame, named as the protocol names its fields. */
export interface StreamFrame {
  event: string;
  /** The raw `data:` payload, unparsed — the caller owns its schema. */
  data: string;
  /** The `id:`, when the frame carried one. */
  id: string;
}

export async function* eventsOf(
  url: string,
  signal: AbortSignal,
  /** Names to listen for. An unlisted event is not delivered. */
  names: readonly string[],
): AsyncGenerator<StreamFrame> {
  const source = new EventSource(url);

  // Events can arrive faster than the consumer pulls, so they queue rather
  // than being dropped; a waiting consumer is handed the next one directly.
  const queued: StreamFrame[] = [];
  let deliver: (() => void) | null = null;
  let failure: Error | null = null;
  let closed = false;

  const wake = () => {
    const waiting = deliver;
    deliver = null;
    waiting?.();
  };

  const onFrame = (event: string) => (message: MessageEvent<string>) => {
    queued.push({ event, data: message.data, id: message.lastEventId });
    wake();
  };

  for (const name of names) source.addEventListener(name, onFrame(name));

  source.addEventListener("error", () => {
    // Mid-run drops fire this while reconnecting (`CONNECTING`) — harmless, since the run is server-side. Treating every `error` as terminal used to turn a lost packet into "analysis failed" on screen.
    // `CLOSED` means the source gave up (404 or unreadable response) — that's the caller's to surface.
    if (source.readyState !== CLOSED) return;
    failure = new Error("analysis stream failed");
    closed = true;
    wake();
  });

  const onAbort = () => {
    closed = true;
    wake();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      while (queued.length > 0) {
        const frame = queued.shift();
        if (frame) yield frame;
      }
      if (failure) throw failure;
      if (closed || signal.aborted) return;

      // oxlint-disable-next-line eslint/no-await-in-loop
      await new Promise<void>((resolve) => {
        deliver = resolve;
      });
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    source.close();
  }
}
