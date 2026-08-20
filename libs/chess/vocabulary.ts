/**
 * Core vocabulary: squares, colors, roles, pieces. Re-exported from
 * chessops as-is — see docs/reference/glossary.md for what each term means.
 */

export type { Color, Piece, Role, Square, SquareName } from "chessops/types";
export { COLORS, ROLES } from "chessops/types";

export { makeSquare, opposite, parseSquare } from "chessops/util";
