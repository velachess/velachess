/**
 * Protocol, session lifecycle, search watchdog and recovery from a dead
 * engine. It judges no moves and decides when nothing starts.
 *
 * Transports are not re-exported: each pulls in platform-only globals, so
 * consumers import the one subpath they need.
 */

export * from "./types.ts";
export * from "./protocol.ts";
export type { OpenTransport, Transport } from "./transport.ts";
export * from "./engine-session.ts";
export * from "./engine-evaluator.ts";
