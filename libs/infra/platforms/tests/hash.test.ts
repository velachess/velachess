import { describe, expect, it } from "vitest";

import { movetextHash } from "@velachess/platforms";
import { CHESS_COM_ARCHIVE_MONTH, LICHESS_GAME_PGN } from "@velachess/fixtures";

describe("movetextHash", () => {
  it("is stable for the same movetext", () => {
    const a = movetextHash('[Event "?"]\n\n1. e4 e5 2. Nf3 *\n');
    const b = movetextHash('[Event "?"]\n\n1. e4 e5 2. Nf3 *\n');
    expect(a).toBe(b);
  });

  it("ignores header differences", () => {
    const withHeaders = movetextHash('[Event "A"]\n[Site "X"]\n\n1. e4 e5 *\n');
    const differentHeaders = movetextHash('[Event "B"]\n[Site "Y"]\n\n1. e4 e5 *\n');
    expect(withHeaders).toBe(differentHeaders);
  });

  it("ignores clock/eval comment differences", () => {
    const noClocks = movetextHash('[Event "?"]\n\n1. e4 e5 *\n');
    const withClocks = movetextHash(
      '[Event "?"]\n\n1. e4 {[%clk 0:03:00]} e5 {[%clk 0:03:00]} *\n',
    );
    expect(noClocks).toBe(withClocks);
  });

  it("differs for different moves", () => {
    const a = movetextHash('[Event "?"]\n\n1. e4 e5 *\n');
    const b = movetextHash('[Event "?"]\n\n1. d4 d5 *\n');
    expect(a).not.toBe(b);
  });

  it("matches across the real Chess.com and Lichess clock-comment spacing styles", () => {
    // Chess.com: `{[%clk 0:03:00]}` (no spaces). Lichess: `{ [%clk 0:10:00] }` (spaces).
    // Neither format should leak into the hash — only the moves matter.
    const chessComGame = CHESS_COM_ARCHIVE_MONTH.games[0];
    if (!chessComGame?.pgn) throw new Error("fixture missing pgn");
    const withoutClocks = chessComGame.pgn.replaceAll(/\{[^}]*\}/g, "");
    expect(movetextHash(chessComGame.pgn)).toBe(movetextHash(withoutClocks));
    expect(movetextHash(LICHESS_GAME_PGN)).not.toBe(movetextHash(chessComGame.pgn));
  });
});
