/**
 * [ENGINE] — talks UCI to a Stockfish process/worker, and keeps that
 * conversation alive: protocol, session lifecycle, search watchdog and
 * recovery from a dead engine. It doesn't judge moves, persist reports, or
 * decide when an engine run starts.
 *
 * Transports aren't re-exported: each pulls in platform-only globals (Node
 * vs browser), so consumers import the one subpath they need.
 */

export * from "./types.ts";
export * from "./protocol.ts";
export type { OpenTransport, Transport } from "./transport.ts";
export * from "./engine-session.ts";
export * from "./engine-evaluator.ts";
