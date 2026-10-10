/**
 * Canonical full-loop test data shared by application/api/worker suites: one
 * chess.com archive with two games. Pure data; the fake fetch lives in
 * @velachess/test-utils.
 */

export const LOOPER_USERNAME = "looper";

/** White (looper) loses after 2. g4?? */
export const LOOPER_LOSS_PGN =
  '[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "0-1"]\n\n1. e4 e6 2. g4 d5 0-1\n';

/** A short win for White (looper). */
export const LOOPER_WIN_PGN =
  '[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "1-0"]\n\n1. e4 e6 1-0\n';

export const LOOPER_ARCHIVES_INDEX = {
  archives: ["https://api.chess.com/pub/player/looper/games/2026/08"],
};

export const LOOPER_ARCHIVE_MONTH = {
  games: [
    {
      url: "https://www.chess.com/game/live/1",
      pgn: LOOPER_LOSS_PGN,
      rules: "chess",
      end_time: 1755100000,
    },
    {
      url: "https://www.chess.com/game/live/2",
      pgn: LOOPER_WIN_PGN,
      rules: "chess",
      end_time: 1755100100,
    },
  ],
};
