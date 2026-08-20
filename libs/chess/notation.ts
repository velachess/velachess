/**
 * SAN — the human-readable notation. `makeSan`/`makeSanVariation` do not
 * mutate the position passed in (they clone internally); `parseSan` never
 * mutates either.
 */

export { makeSan, makeSanVariation, parseSan } from "chessops/san";
