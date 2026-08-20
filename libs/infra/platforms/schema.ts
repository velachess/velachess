/**
 * The shape every provider converges on. Defined once with zod so runtime
 * validation and compile-time types come from the same source instead of
 * drifting — see providers/chess-com.ts for where a malformed API response
 * gets caught here before it ever reaches the normalizer.
 */

import { z } from "zod";

export const gameSourceSchema = z.enum(["chess_com", "lichess", "pgn"]);
export type GameSource = z.infer<typeof gameSourceSchema>;

export const perspectiveSchema = z.enum(["white", "black"]);
export type Perspective = z.infer<typeof perspectiveSchema>;

export const resultSchema = z.enum(["1-0", "0-1", "1/2-1/2", "*"]);
export type GameResult = z.infer<typeof resultSchema>;

export const normalizedGameSchema = z.object({
  source: gameSourceSchema,
  /** Null only for a pasted PGN — Chess.com and Lichess games always carry one. */
  externalId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  /** Which side is "you". Never guessed — null until the caller/UI resolves it. */
  perspective: perspectiveSchema.nullable(),
  white: z.object({ name: z.string(), rating: z.number().optional() }),
  black: z.object({ name: z.string(), rating: z.number().optional() }),
  result: resultSchema,
  playedAt: z.date().optional(),
  timeControl: z.object({
    initialSeconds: z.number().optional(),
    incrementSeconds: z.number().optional(),
    raw: z.string().optional(),
  }),
  opening: z.object({
    eco: z.string().optional(),
    name: z.string().optional(),
    url: z.string().optional(),
  }),
  termination: z.string().optional(),
  /** Whether the PGN carries [%clk ...] annotations — a downstream "you spent
   * 49s here" claim is only valid when this is true. */
  hasClocks: z.boolean(),
  /** Source of truth. Never re-derive moves from anything else — re-parse this. */
  rawPgn: z.string(),
  /** Dedup key: sha256 of the movetext with headers and clock/eval comments
   * stripped, so the same game re-fetched with different formatting still
   * matches. */
  movetextHash: z.string(),
});
export type NormalizedGame = z.infer<typeof normalizedGameSchema>;

export const syncFailureSchema = z.object({
  scope: z.enum(["archive-month", "page", "game"]),
  ref: z.string(),
  reason: z.enum([
    "http-error",
    "rate-limited",
    "parse-error",
    "invalid-response",
    "unsupported-variant",
    "network",
  ]),
  retryable: z.boolean(),
  detail: z.string(),
});
export type SyncFailure = z.infer<typeof syncFailureSchema>;

export const syncResultSchema = z.object({
  games: z.array(normalizedGameSchema),
  failures: z.array(syncFailureSchema),
  /** Opaque — only the provider that produced it knows how to read it back. */
  cursor: z.unknown().nullable(),
  /** False if any failure occurred this call. See providers for what "resume" means per source. */
  complete: z.boolean(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;

/** Injectable fetch, so provider tests can supply a double instead of hitting the network. */
export type FetchFn = typeof globalThis.fetch;
