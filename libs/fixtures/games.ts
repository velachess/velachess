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
 * The player a manual import names as theirs — one person, both colors
 * across the file. Invented handle; a test has no business shipping a
 * real player's name.
 */
export const IMPORTED_PLAYER_NAME = "Ada Lovelace";

/**
 * One upload, two games, opposite seats: the named player is White in
 * the first and Black in the second, so per-game perspective resolution
 * has something honest to resolve.
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

/** A short Spanish, tagged with player names so a manual import can attribute it. */
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
