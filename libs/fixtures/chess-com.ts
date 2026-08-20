/**
 * Chess.com Published-Data API response shapes.
 *
 * The *shapes* are what matter and they are faithful to the documented
 * API: the archives index, a finished game, an in-progress daily game
 * (Chess.com omits `pgn` until it ends), and a variant game. The players,
 * ratings, links and timestamps are invented — a test fixture has no
 * business republishing a real person's games, and nothing here depends
 * on whose they are.
 *
 * The one detail that IS load-bearing: Chess.com's PGN never carries a
 * `[Variant]` tag, which is why the variant filter in the chess.com
 * provider reads `rules` from this JSON rather than from the PGN text.
 * The `[%clk ...]` annotations are written the way Chess.com writes them,
 * with no spaces inside the braces.
 */

const PLAYER = "test-player";

export const CHESS_COM_ARCHIVES_INDEX = {
  archives: [
    `https://api.chess.com/pub/player/${PLAYER}/games/2023/12`,
    `https://api.chess.com/pub/player/${PLAYER}/games/2024/01`,
  ],
};

/** Faithful headers and clock annotations; invented players. */
const SAMPLE_GAME_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.01.01"]
[Round "-"]
[White "test-player"]
[Black "test-rival"]
[Result "1-0"]
[ECO "B23"]
[ECOUrl "https://www.chess.com/openings/Closed-Sicilian-Defense-Grand-Prix-Attack-3...g6-4.Bc4-Bg7-5.Nf3"]
[UTCDate "2024.01.01"]
[UTCTime "18:23:37"]
[WhiteElo "1500"]
[BlackElo "1480"]
[TimeControl "180"]
[Termination "test-player won by resignation"]
[Link "https://www.chess.com/game/live/100000001"]

1. e4 {[%clk 0:03:00]} 1... c5 {[%clk 0:03:00]} 2. Nc3 {[%clk 0:02:59.9]} 2... g6 {[%clk 0:02:57.5]} 3. f4 {[%clk 0:02:59.8]} 3... Bg7 {[%clk 0:02:56]} 1-0
`;

export const CHESS_COM_ARCHIVE_MONTH = {
  games: [
    {
      url: "https://www.chess.com/game/live/100000001",
      pgn: SAMPLE_GAME_PGN,
      rules: "chess",
      end_time: 1704133706,
    },
    // In-progress daily game — Chess.com omits `pgn` until it finishes; a
    // real, documented shape, not an error case.
    {
      url: "https://www.chess.com/game/daily/100000002",
      rules: "chess",
      end_time: 1704200000,
    },
    // Variant game — filtered before normalization since Chess.com's PGN
    // itself carries no [Variant] tag to filter on.
    {
      url: "https://www.chess.com/game/live/100000003",
      pgn: SAMPLE_GAME_PGN,
      rules: "chess960",
      end_time: 1704140000,
    },
  ],
};
