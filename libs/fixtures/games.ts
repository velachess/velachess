/**
 * Named PGN games, reused across packages. Pure data — see positions.ts.
 */

/** Shortest possible checkmate. Final position matches FOOLS_MATE_CHECKMATE in positions.ts. */
export const FOOLS_MATE_PGN = `[Event "Fool's Mate"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
`;

/** Legal opening, then an illegal move (Ra3 — blocked by White's own a2 pawn,
 * which hasn't moved). Exercises "stop at the first illegal move", not a real game. */
export const ILLEGAL_MOVE_PGN = `[Event "Illegal move"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Ra3 *
`;

/** Two games in one PGN — the second is unfinished on purpose. */
export const MULTI_GAME_PGN = `${FOOLS_MATE_PGN}
[Event "Unfinished"]
[Site "?"]
[Result "*"]

1. e4 e5 *
`;

/**
 * White's repertoire against 1...e5 and 1...c5, as a PGN with a variation.
 * The variation gives the opponent's reply node two children (e5 mainline,
 * c5 sideline); White's own moves each have exactly one child, by
 * repertoire convention.
 */
export const RUY_LOPEZ_REPERTOIRE_PGN = `[Event "Repertoire"]
[Site "?"]
[Result "*"]

1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *
`;

/** Follows RUY_LOPEZ_REPERTOIRE_PGN's mainline exactly, stopping where the repertoire does — no deviation. */
export const RUY_LOPEZ_IN_BOOK_GAME_PGN = `[Event "In book"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *
`;

/** Matches the repertoire until White plays Bc4 instead of the prepared Ba4. */
export const RUY_LOPEZ_DEVIATION_GAME_PGN = `[Event "Deviation"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bc4 *
`;

/** Black replies 1...d5 — neither of the repertoire's prepared replies (e5, c5). */
export const RUY_LOPEZ_GAP_GAME_PGN = `[Event "Gap"]
[Site "?"]
[Result "*"]

1. e4 d5 *
`;

/**
 * White has two prepared second moves against 1...e5: the mainline 2.Nf3 and
 * the sideline 2.Bc4 — a node with more than one of the repertoire owner's
 * own moves.
 */
export const RUY_LOPEZ_MULTI_CHOICE_PGN = `[Event "Multi-choice"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Nf3 (2. Bc4) *
`;

/** Matches neither prepared second move (Nf3 or Bc4) — White plays Qh5 instead. */
export const RUY_LOPEZ_MULTI_CHOICE_DEVIATION_GAME_PGN = `[Event "Multi-choice deviation"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Qh5 *
`;

/**
 * White's repertoire modeling two move orders into the same position: the
 * mainline 1.e4 e5 2.Nf3, and a sideline 1.Nf3 e5 2.e4 — both reach the
 * identical position (e4 and Nf3 don't interact, so the order between them
 * doesn't matter), with only the mainline continuing to 2...Nc6.
 */
export const TRANSPOSITION_REPERTOIRE_PGN = `[Event "Transposition"]
[Site "?"]
[Result "*"]

1. e4 (1. Nf3 e5 2. e4) e5 2. Nf3 Nc6 *
`;

/** Follows the sideline's exact move order (Nf3 before e4), then plays the mainline's prepared reply (Nc6) — only findable via the position transposing back into the mainline node. */
export const TRANSPOSITION_GAME_PGN = `[Event "Transposition game"]
[Site "?"]
[Result "*"]

1. Nf3 e5 2. e4 Nc6 *
`;

/**
 * A legal mainline reply (1...e5) alongside an illegal sideline (1...Ra6 —
 * blocked by Black's own a7 pawn). Exercises that one illegal branch is
 * reported, not silently dropped, without taking its legal sibling with it.
 */
export const ILLEGAL_REPERTOIRE_PGN = `[Event "Illegal repertoire"]
[Site "?"]
[Result "*"]

1. e4 e5 (1... Ra6) 2. Nf3 *
`;

const AFTER_1_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

/** A Black repertoire against 1.e4, starting from a custom [FEN] header instead of the standard starting position. */
export const SICILIAN_REPERTOIRE_PGN = `[Event "Custom start"]
[Site "?"]
[FEN "${AFTER_1_E4_FEN}"]
[Result "*"]

1... c5 2. Nf3 d6 *
`;

/** Follows SICILIAN_REPERTOIRE_PGN's mainline exactly, from the same custom starting FEN. */
export const SICILIAN_IN_BOOK_GAME_PGN = `[Event "Custom start game"]
[Site "?"]
[FEN "${AFTER_1_E4_FEN}"]
[Result "*"]

1... c5 2. Nf3 d6 *
`;

const PAWN_ON_E7_FEN = "7k/4P3/8/8/8/8/8/K7 w - - 0 1";

/** A one-move repertoire: promote the e7 pawn to a queen. */
export const PROMOTION_REPERTOIRE_PGN = `[Event "Promotion"]
[Site "?"]
[FEN "${PAWN_ON_E7_FEN}"]
[Result "*"]

1. e8=Q *
`;

/** Matches PROMOTION_REPERTOIRE_PGN exactly. */
export const PROMOTION_IN_BOOK_GAME_PGN = `[Event "Promotion in book"]
[Site "?"]
[FEN "${PAWN_ON_E7_FEN}"]
[Result "*"]

1. e8=Q *
`;

/** Underpromotes instead of the prepared queen promotion. */
export const PROMOTION_DEVIATION_GAME_PGN = `[Event "Promotion deviation"]
[Site "?"]
[FEN "${PAWN_ON_E7_FEN}"]
[Result "*"]

1. e8=N *
`;
