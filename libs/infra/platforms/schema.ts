/**
 * The shape every provider converges on, defined once with zod so runtime
 * validation and compile-time types come from one source.
 */

import { z } from "zod";

export const gameSourceSchema = z.enum(["chess_com", "lichess", "pgn"]);
export type GameSource = z.infer<typeof gameSourceSchema>;

/**
 * `gameSourceSchema` minus `"pgn"`, a paste having no archive to walk and
 * no profile to ask about.
 *
 * Canonical: `tracked_accounts.platform` and `provider_profiles.platform`
 * are built from `.options`, and every module that names the concept
 * imports this instead of writing the union again. `GameSource` answers
 * "where did this game come from"; this answers "whose archive can we
 * walk". Two different questions, which is why both exist.
 */
export const accountPlatformSchema = z.enum(["chess_com", "lichess"]);
export type AccountPlatform = z.infer<typeof accountPlatformSchema>;

/** Both providers fold case on a handle, so every write and lookup keys on
 * this. One function, so a write and a read cannot differ. */
export function normalizeUsername(username: string): string {
  return username.toLowerCase();
}

export const perspectiveSchema = z.enum(["white", "black"]);
export type Perspective = z.infer<typeof perspectiveSchema>;

export const resultSchema = z.enum(["1-0", "0-1", "1/2-1/2", "*"]);
export type GameResult = z.infer<typeof resultSchema>;

export const normalizedGameSchema = z.object({
  source: gameSourceSchema,
  /** Null only for a pasted PGN. */
  externalId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  /** Never guessed: null until a caller resolves it. */
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
  /** Whether the PGN carries `[%clk ...]`, without which no time-spent
   * claim is valid. */
  hasClocks: z.boolean(),
  /** Source of truth: re-parse this rather than deriving moves. */
  rawPgn: z.string(),
  /** sha256 of the movetext with headers and clock/eval comments stripped,
   * so the same game re-fetched with other formatting still matches. */
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
    "not-found",
  ]),
  retryable: z.boolean(),
  detail: z.string(),
});
export type SyncFailure = z.infer<typeof syncFailureSchema>;

export const syncResultSchema = z.object({
  games: z.array(normalizedGameSchema),
  failures: z.array(syncFailureSchema),
  /** Opaque: only the provider that produced it reads it back. */
  cursor: z.unknown().nullable(),
  /** False if anything failed this call; each provider defines its own
   * resume. */
  complete: z.boolean(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;

export type FetchFn = typeof globalThis.fetch;
