/**
 * A chess.com archive with every tag a real one carries (unlike the bare
 * `looper` fixtures) — full UTCDate/UTCTime tags and both colors played,
 * since a fixture missing either previously shipped a broken games list.
 */
export const LISTER_USERNAME = "lister";

/** Ratings, a clock, and an opening — the row's whole vocabulary. */
export const LISTER_AS_WHITE_PGN =
  '[Event "Live Chess"]\n' +
  `[White "${LISTER_USERNAME}"]\n` +
  '[Black "rival"]\n' +
  '[Result "1-0"]\n' +
  '[UTCDate "2026.06.15"]\n' +
  '[UTCTime "12:00:00"]\n' +
  '[WhiteElo "1480"]\n' +
  '[BlackElo "1502"]\n' +
  '[TimeControl "600"]\n' +
  '[ECO "C00"]\n' +
  '[Opening "French Defense"]\n' +
  '[ECOUrl "https://www.chess.com/openings/French-Defense"]\n' +
  "\n1. e4 e6 2. d4 d5 1-0\n";

/** The other seat, and an increment: 3+2 must not read as "3 min". */
export const LISTER_AS_BLACK_PGN =
  '[Event "Live Chess"]\n' +
  '[White "rival"]\n' +
  `[Black "${LISTER_USERNAME}"]\n` +
  '[Result "1-0"]\n' +
  '[UTCDate "2026.06.15"]\n' +
  '[UTCTime "12:30:00"]\n' +
  '[WhiteElo "1502"]\n' +
  '[BlackElo "1480"]\n' +
  '[TimeControl "180+2"]\n' +
  '[ECO "B10"]\n' +
  '[Opening "Caro-Kann Defense"]\n' +
  '[ECOUrl "https://www.chess.com/openings/Caro-Kann-Defense"]\n' +
  "\n1. e4 c6 2. d4 d5 1-0\n";

export const LISTER_ARCHIVES_INDEX = {
  archives: [`https://api.chess.com/pub/player/${LISTER_USERNAME}/games/2026/06`],
};

export const LISTER_ARCHIVE_MONTH = {
  games: [
    {
      url: "https://www.chess.com/game/live/21",
      pgn: LISTER_AS_WHITE_PGN,
      rules: "chess",
      end_time: 1750000000,
    },
    {
      url: "https://www.chess.com/game/live/22",
      pgn: LISTER_AS_BLACK_PGN,
      rules: "chess",
      end_time: 1750000100,
    },
  ],
};
