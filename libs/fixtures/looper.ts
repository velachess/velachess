/**
 * Canonical full-loop test data shared by application/api/worker suites: one
 * chess.com archive, two games (one deviating badly from book with 2.g4??,
 * one staying in book). Pure data; the fake fetch lives in @velachess/test-utils.
 */

export const LOOPER_USERNAME = "looper";

/** The white repertoire the games are judged against. */
export const LOOPER_REPERTOIRE_PGN = "1. e4 e6 2. d4 d5 3. Nc3 *";

/** White (looper) leaves book with 2. g4?? — the harmful deviation. */
export const LOOPER_DEVIANT_PGN =
  '[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "0-1"]\n\n1. e4 e6 2. g4 d5 0-1\n';

/** Ends while still inside the repertoire — no deviation to drill. */
export const LOOPER_IN_BOOK_PGN =
  '[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "1-0"]\n\n1. e4 e6 1-0\n';

export const LOOPER_ARCHIVES_INDEX = {
  archives: ["https://api.chess.com/pub/player/looper/games/2026/08"],
};

export const LOOPER_ARCHIVE_MONTH = {
  games: [
    {
      url: "https://www.chess.com/game/live/1",
      pgn: LOOPER_DEVIANT_PGN,
      rules: "chess",
      end_time: 1755100000,
    },
    {
      url: "https://www.chess.com/game/live/2",
      pgn: LOOPER_IN_BOOK_PGN,
      rules: "chess",
      end_time: 1755100100,
    },
  ],
};

// --- Extraction scenario (cycle 6): three white games. Two share the full
// French line (the book the trie should extract with minGames 2); one
// deviates INSIDE that book with 2. g4?? — a real blunder at ply 3, so the
// extracted repertoire produces a harmful, drillable deviation.
export const LOOPER_FRENCH_ECOURL =
  "https://www.chess.com/openings/French-Defense-Winawer-Variation-4.e5-c5-5.a3";

export const LOOPER_EXTRACT_MAIN_PGN = `[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "1-0"]\n[ECOUrl "${LOOPER_FRENCH_ECOURL}"]\n\n1. e4 e6 2. d4 d5 3. Nc3 Bb4 1-0\n`;

export const LOOPER_EXTRACT_MAIN2_PGN = `[Event "Live Chess"]\n[White "looper"]\n[Black "buddy"]\n[Result "1/2-1/2"]\n[ECOUrl "${LOOPER_FRENCH_ECOURL}"]\n\n1. e4 e6 2. d4 d5 3. Nc3 Bb4 1/2-1/2\n`;

export const LOOPER_EXTRACT_DEVIANT_PGN = `[Event "Live Chess"]\n[White "looper"]\n[Black "rival"]\n[Result "0-1"]\n[ECOUrl "${LOOPER_FRENCH_ECOURL}"]\n\n1. e4 e6 2. g4 d5 0-1\n`;

export const LOOPER_EXTRACT_ARCHIVES_INDEX = {
  archives: ["https://api.chess.com/pub/player/looper/games/2026/07"],
};

export const LOOPER_EXTRACT_ARCHIVE_MONTH = {
  games: [
    {
      url: "https://www.chess.com/game/live/11",
      pgn: LOOPER_EXTRACT_MAIN_PGN,
      rules: "chess",
      end_time: 1753000000,
    },
    {
      url: "https://www.chess.com/game/live/12",
      pgn: LOOPER_EXTRACT_MAIN2_PGN,
      rules: "chess",
      end_time: 1753000100,
    },
    {
      url: "https://www.chess.com/game/live/13",
      pgn: LOOPER_EXTRACT_DEVIANT_PGN,
      rules: "chess",
      end_time: 1753000200,
    },
  ],
};
