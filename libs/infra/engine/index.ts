/**
 * [ENGINE] — talks UCI to a Stockfish process/worker and streams back what
 * it says; doesn't judge moves or orchestrate a game. Transports aren't
 * re-exported: each pulls in platform-only globals (Node vs browser), so
 * consumers import the one subpath they need.
 */

export * from "./types.ts";
export * from "./protocol.ts";
export type { Transport } from "./transport.ts";
export * from "./session.ts";
