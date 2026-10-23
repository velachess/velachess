/** Its final position is `FOOLS_MATE_CHECKMATE` in positions.ts. */
export const FOOLS_MATE_PGN = `[Event "Fool's Mate"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
`;

/** Ra3 is blocked by White's own a2 pawn: two legal moves, then a stop. */
export const ILLEGAL_MOVE_PGN = `[Event "Illegal move"]
[Site "?"]
[Result "*"]

1. e4 e5 2. Ra3 *
`;

/** No knight reaches f6 in one move: zero legal moves, unlike
 * ILLEGAL_MOVE_PGN. */
export const NO_LEGAL_MOVES_PGN = `[Event "No legal moves"]
[Site "?"]
[Result "*"]

1. Nf6 *
`;

/** Unterminated header quote: malformed structure, not an illegal move. */
export const MALFORMED_HEADER_PGN = `[Event "Malformed
[Site "?"]

1. e4 e5 *
`;

/** The second game is unfinished on purpose. */
export const MULTI_GAME_PGN = `${FOOLS_MATE_PGN}
[Event "Unfinished"]
[Site "?"]
[Result "*"]

1. e4 e5 *
`;

/** Invented: a fixture has no business shipping a real player's name. */
export const IMPORTED_PLAYER_NAME = "Ada Lovelace";

/**
 * The named player is White in the first game and Black in the second, so
 * per-game perspective resolution has something to resolve.
 */
export const MIXED_COLOR_PGN = `[Event "As white"]
[Site "?"]
[White "${IMPORTED_PLAYER_NAME}"]
[Black "Invented Opponent"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *
[Event "As black"]
[Site "?"]
[White "Invented Opponent"]
[Black "${IMPORTED_PLAYER_NAME}"]
[Result "*"]

1. d4 d5 2. c4 e6 *
`;

/** Tagged with player names, so a manual import can attribute it. */
export const NAMED_FIRST_GAME_PGN = `[Event "Named first"]
[Site "?"]
[White "${IMPORTED_PLAYER_NAME}"]
[Black "Marcel Duchamp"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *
`;

/** The same opening with a different fourth move, so the two games hash differently. */
export const NAMED_SECOND_GAME_PGN = `[Event "Named second"]
[Site "?"]
[White "${IMPORTED_PLAYER_NAME}"]
[Black "Marcel Duchamp"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bc4 *
`;
