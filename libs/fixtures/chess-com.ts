/**
 * The shapes are faithful to the documented API; the players, ratings,
 * links and timestamps are invented.
 *
 * Load-bearing: Chess.com's PGN carries no `[Variant]` tag, which is why
 * the provider's variant filter reads `rules` from this JSON, and the
 * `[%clk ...]` annotations are written as Chess.com writes them, with no
 * spaces inside the braces.
 */

const PLAYER = "test-player";

export const CHESS_COM_ARCHIVES_INDEX = {
  archives: [
    `https://api.chess.com/pub/player/${PLAYER}/games/2023/12`,
    `https://api.chess.com/pub/player/${PLAYER}/games/2024/01`,
  ],
};

/** Faithful headers and clock annotations, invented players. */
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
    // Chess.com omits `pgn` until a daily game finishes: a documented
    // shape, not an error case.
    {
      url: "https://www.chess.com/game/daily/100000002",
      rules: "chess",
      end_time: 1704200000,
    },
    // Filtered before normalization, the PGN carrying no [Variant] tag.
    {
      url: "https://www.chess.com/game/live/100000003",
      pgn: SAMPLE_GAME_PGN,
      rules: "chess960",
      end_time: 1704140000,
    },
  ],
};
