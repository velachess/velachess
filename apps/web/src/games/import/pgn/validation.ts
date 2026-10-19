import type { MessageDescriptor } from "@lingui/core";

import { hasPlayableGame } from "@velachess/chess";

import { z } from "../../../libs/zod.ts";

export type Translate = (message: MessageDescriptor) => string;

/** ChessBase-style: forced White or Black for the whole batch, or by name
 * matched against each game's own headers. */
export const PARTICIPATION_MODES = {
  white: "white",
  black: "black",
  byName: "byName",
} as const;

export type ParticipationMode =
  (typeof PARTICIPATION_MODES)[keyof typeof PARTICIPATION_MODES];

/**
 * Mirrors the server's `participation` shape 1:1 (apps/server/src/routes/
 * games.ts) so the two never drift silently.
 */
export type Participation =
  | { mode: typeof PARTICIPATION_MODES.white }
  | { mode: typeof PARTICIPATION_MODES.black }
  | { mode: typeof PARTICIPATION_MODES.byName; playerName: string };

/**
 * The PGN field's own check — reuses the backend's own parser/legality
 * logic (`hasPlayableGame`, libs/chess) instead of a regex, so "looks like
 * PGN" never passes as "is a game". `superRefine` so an empty value reports
 * only `requiredMessage`, never both messages at once.
 */
function buildPgnSchema(
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

export interface PgnImportCopy {
  pgnRequired: MessageDescriptor;
  pgnInvalid: MessageDescriptor;
  participationRequired: MessageDescriptor;
  playerRequired: MessageDescriptor;
}

/**
 * The one schema the form validates against, raw fields in, `{ pgn,
 * participation }` out — the UI→domain shape change lives in `.transform`,
 * not in a parallel `toParticipation` helper the form has to stay in sync
 * with by hand. Used as a whole-form validator (`useForm`'s `onMount`/
 * `onChange`), so each issue's `path` routes it to its own `form.Field`
 * automatically (`@tanstack/form-core`'s `standardSchemaValidator`) — no
 * manual touched/invalid state. Per render: zod bakes error text in, so it
 * needs an active locale — same pattern as games/import/accounts/sources.ts's
 * `buildSchema(translate)`.
 */
export function buildPgnImportFormSchema(translate: Translate, copy: PgnImportCopy) {
  return z
    .object({
      pgn: buildPgnSchema(translate, copy.pgnRequired, copy.pgnInvalid),
      participationMode: z.enum(PARTICIPATION_MODES, {
        message: translate(copy.participationRequired),
      }),
      playerName: z.string(),
    })
    .superRefine((value, ctx) => {
      if (
        value.participationMode === PARTICIPATION_MODES.byName &&
        value.playerName.trim().length === 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["playerName"],
          message: translate(copy.playerRequired),
        });
      }
    })
    .transform(
      ({
        pgn,
        participationMode,
        playerName,
      }): { pgn: string; participation: Participation } => ({
        pgn,
        participation:
          participationMode === PARTICIPATION_MODES.byName
            ? { mode: PARTICIPATION_MODES.byName, playerName: playerName.trim() }
            : { mode: participationMode },
      }),
    );
}
