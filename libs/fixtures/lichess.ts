/**
 * Real Lichess PGN-export shape (game TJxUmbWK). Differs from Chess.com:
 * [Site] is the real game URL, and clock comments have spaces inside braces
 * (`{ [%clk ...] }` vs Chess.com's `{[%clk ...]}`).
 */

/** Real game, fetched live via `GET /game/export/TJxUmbWK?clocks=true`. */
export const LICHESS_GAME_PGN = `[Event "Daily Rapid Arena"]
[Site "https://lichess.org/TJxUmbWK"]
[Date "2017.08.30"]
[Round "-"]
[White "arex"]
[Black "JERC-12Jesus"]
[Result "1-0"]
[GameId "TJxUmbWK"]
[UTCDate "2017.08.30"]
[UTCTime "20:40:27"]
[WhiteElo "1627"]
[BlackElo "1740"]
[Variant "Standard"]
[TimeControl "600+0"]
[ECO "B07"]
[Opening "Pirc Defense"]
[Termination "Normal"]

1. e4 { [%clk 0:10:00] } 1... d6 { [%clk 0:10:00] } 2. d4 { [%clk 0:09:58] } 2... Nf6 { [%clk 0:09:58] } 3. Nc3 { [%clk 0:09:55] } 3... g6 { [%clk 0:09:56] } 1-0
`;

/** Second game, same verified tag/comment conventions, for multi-game split tests. */
const SECOND_GAME_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/aB3dEfGh"]
[Date "2024.03.10"]
[Round "-"]
[White "JERC-12Jesus"]
[Black "arex"]
[Result "0-1"]
[GameId "aB3dEfGh"]
[UTCDate "2024.03.10"]
[UTCTime "09:12:00"]
[WhiteElo "1745"]
[BlackElo "1630"]
[Variant "Standard"]
[TimeControl "300+3"]
[ECO "C50"]
[Opening "Italian Game"]
[Termination "Normal"]

1. e4 { [%clk 0:05:00] } 1... e5 { [%clk 0:05:00] } 2. Bc4 { [%clk 0:04:58] } 2... Nf6 { [%clk 0:04:57] } 0-1
`;

export const LICHESS_PGN_EXPORT = `${LICHESS_GAME_PGN}\n${SECOND_GAME_PGN}`;

/** Hand-built (not fetched) — exercises the [Variant] filter path, which is
 * Lichess-specific since Chess.com's PGN carries no such tag. */
export const LICHESS_VARIANT_PGN = `[Event "Rated Chess960 game"]
[Site "https://lichess.org/zZ9yYxXw"]
[Date "2024.03.10"]
[Round "-"]
[White "arex"]
[Black "JERC-12Jesus"]
[Result "1-0"]
[GameId "zZ9yYxXw"]
[Variant "Chess960"]
[TimeControl "300+0"]
[Termination "Normal"]

1. g3 g6 1-0
`;
