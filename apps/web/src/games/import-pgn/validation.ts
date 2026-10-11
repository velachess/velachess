import { z } from "../../libs/zod.ts";

import { hasPlayableGame } from "@velachess/chess";

/**
 * How the uploader identifies themselves — ChessBase-style: forced White or
 * Black for the whole batch, or by name matched against each game's own
 * headers. Mirrors the server's `participation` shape 1:1 (apps/server/src/
 * routes/games.ts) so the two never drift silently.
 */
const participationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("white") }),
  z.object({ mode: z.literal("black") }),
  z.object({
    mode: z.literal("byName"),
    playerName: z.string().trim().min(1),
  }),
]);
export type Participation = z.infer<typeof participationSchema>;

/**
 * The PGN field's own check — reuses the same parser/legality logic as the
 * backend (`replayMainline`) instead of a regex, so "looks like PGN" never
 * passes as "is a game". No `message` here on purpose: display text is a
 * Lingui `msg` the dialog picks itself (empty vs unplayable), never a raw
 * Zod string.
 */
export const pgnSchema = z.string().trim().min(1).refine(hasPlayableGame);

export const pgnImportFormSchema = z.object({
  pgn: pgnSchema,
  participation: participationSchema,
});
