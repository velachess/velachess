/**
 * Named FEN positions, reused across packages instead of hardcoding FEN
 * strings in every test file. Pure data — no dependency on any rules
 * library, so any package can import these regardless of which chess
 * library it wraps.
 */

export const STARTING_POSITION =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** After 1. f3 e5 2. g4 Qh4# — white is checkmated. */
export const FOOLS_MATE_CHECKMATE =
  "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

/** Black to move, not in check, no legal move: king a8, boxed in by White's queen on b6. */
export const STALEMATE_KING_IN_CORNER = "k7/8/1Q6/8/8/8/8/7K b - - 0 1";

/** White to move, pawn on a7 one step from promoting. */
export const PAWN_PROMOTION_AVAILABLE = "8/P7/8/8/8/8/8/k6K w - - 0 1";

/** White to move, right after 1. e4 d5 2. e5 f5 — exd6 e.p. is legal this move only. */
export const EN_PASSANT_AVAILABLE =
  "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3";

/** Nothing but kings and rooks on the back ranks — both sides can castle either way. */
export const CASTLING_AVAILABLE = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
