import type { MessageDescriptor } from "@lingui/core";

import { hasPlayableGame } from "@velachess/chess";

import { z } from "../../../libs/zod.ts";

export type Translate = (message: MessageDescriptor) => string;

export const PARTICIPATION_MODES = {
  white: "white",
  black: "black",
  byName: "byName",
} as const;

export type ParticipationMode =
  (typeof PARTICIPATION_MODES)[keyof typeof PARTICIPATION_MODES];

/** Mirrors the server's `participation` shape (apps/server/src/routes/
 * games.ts). */
export type Participation =
  | { mode: typeof PARTICIPATION_MODES.white }
  | { mode: typeof PARTICIPATION_MODES.black }
  | { mode: typeof PARTICIPATION_MODES.byName; playerName: string };

/**
 * Reuses `hasPlayableGame` rather than a regex, so "looks like PGN" never
 * passes as "is a game". `superRefine`, so an empty value reports only
 * `requiredMessage`.
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
 * Raw fields in, `{ pgn, participation }` out, so the shape change lives in
 * `.transform` rather than a helper the form has to keep in sync. A
 * whole-form validator, so each issue's `path` routes it to its own
 * `form.Field`. Built per render because zod bakes the error text in and
 * needs the active locale.
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
