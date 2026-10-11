import type { MessageDescriptor } from "@lingui/core";

import { hasPlayableGame } from "@velachess/chess";

import { z } from "../../libs/zod.ts";

export type Translate = (message: MessageDescriptor) => string;

export type ParticipationMode = "white" | "black" | "byName";

/**
 * How the uploader identifies themselves — ChessBase-style: forced White or
 * Black for the whole batch, or by name matched against each game's own
 * headers. Mirrors the server's `participation` shape 1:1 (apps/server/src/
 * routes/games.ts) so the two never drift silently.
 */
export type Participation =
  | { mode: "white" }
  | { mode: "black" }
  | { mode: "byName"; playerName: string };

/**
 * The PGN field's own check — reuses the backend's own parser/legality
 * logic (`hasPlayableGame`, libs/chess) instead of a regex, so "looks like
 * PGN" never passes as "is a game". `superRefine` so an empty value reports
 * only `requiredMessage`, never both messages at once. Per render: zod
 * bakes error text in, so it needs an active locale — same pattern as
 * games/import/sources.ts's `buildSchema(translate)`.
 */
export function buildPgnSchema(
  translate: Translate,
  requiredMessage: MessageDescriptor,
  invalidMessage: MessageDescriptor,
) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: "custom", message: translate(requiredMessage) });
        return;
      }
      if (!hasPlayableGame(value)) {
        ctx.addIssue({ code: "custom", message: translate(invalidMessage) });
      }
    });
}

/** One of White, Black or By name — nothing selected yet fails with `requiredMessage`. */
export function buildParticipationModeSchema(
  translate: Translate,
  requiredMessage: MessageDescriptor,
) {
  return z.enum(["white", "black", "byName"], { message: translate(requiredMessage) });
}

/** Only rendered (and therefore only validated) while By name is selected. */
export function buildPlayerNameSchema(
  translate: Translate,
  requiredMessage: MessageDescriptor,
) {
  return z.string().trim().min(1, translate(requiredMessage));
}
