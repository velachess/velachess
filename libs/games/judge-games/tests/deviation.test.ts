import {
  PROMOTION_DEVIATION_GAME_PGN,
  PROMOTION_IN_BOOK_GAME_PGN,
  PROMOTION_REPERTOIRE_PGN,
  RUY_LOPEZ_DEVIATION_GAME_PGN,
  RUY_LOPEZ_GAP_GAME_PGN,
  RUY_LOPEZ_IN_BOOK_GAME_PGN,
  RUY_LOPEZ_MULTI_CHOICE_DEVIATION_GAME_PGN,
  RUY_LOPEZ_MULTI_CHOICE_PGN,
  RUY_LOPEZ_REPERTOIRE_PGN,
  SICILIAN_IN_BOOK_GAME_PGN,
  SICILIAN_REPERTOIRE_PGN,
  TRANSPOSITION_GAME_PGN,
  TRANSPOSITION_REPERTOIRE_PGN,
} from "@velachess/fixtures";
import { type Game, type PgnNodeData, parsePgn, replayMainline } from "@velachess/chess";
import { buildRepertoire } from "@velachess/repertoires";
import { describe, expect, it } from "vitest";

import { findDeviation } from "../deviation.ts";

function firstGame(pgn: string): Game<PgnNodeData> {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error("expected at least one game");
  return game;
}

function repertoireOf(pgn: string) {
  return buildRepertoire(firstGame(pgn)).unwrap();
}

describe("findDeviation", () => {
  const ruyLopez = repertoireOf(RUY_LOPEZ_REPERTOIRE_PGN);

  it("reports no event when the game stays entirely in book", () => {
    const replay = replayMainline(firstGame(RUY_LOPEZ_IN_BOOK_GAME_PGN)).unwrap();

    const result = findDeviation(ruyLopez, replay, "white");

    expect(result.event).toBeNull();
    expect(result.inBookPlies).toBe(7); // e4 e5 Nf3 Nc6 Bb5 a6 Ba4 — the whole repertoire, matched
  });

  it("flags a deviation when White's own move doesn't match the prepared line", () => {
    const replay = replayMainline(firstGame(RUY_LOPEZ_DEVIATION_GAME_PGN)).unwrap();

    const result = findDeviation(ruyLopez, replay, "white");

    expect(result.inBookPlies).toBe(6); // e4 e5 Nf3 Nc6 Bb5 a6 all matched
    expect(result.event?.type).toBe("deviation");
    expect(result.event?.ply).toBe(7); // 4. Bc4
    expect(result.event?.actualSan).toBe("Bc4");
    expect(result.event?.expectedMoves).toEqual([
      { move: expect.any(Object), san: "Ba4" },
    ]);
  });

  it("flags a gap when the opponent's reply isn't a prepared branch", () => {
    const replay = replayMainline(firstGame(RUY_LOPEZ_GAP_GAME_PGN)).unwrap();

    const result = findDeviation(ruyLopez, replay, "white");

    expect(result.inBookPlies).toBe(1); // e4 matched
    expect(result.event?.type).toBe("gap");
    expect(result.event?.ply).toBe(2); // 1...d5
    expect(result.event?.actualSan).toBe("d5");
    expect(result.event?.expectedMoves).toBeUndefined(); // no single "expected" opponent reply
  });

  it("flags book-ended, not gap, when the game simply continues past the end of the prepared line", () => {
    const replay = replayMainline(
      firstGame(
        `[Event "Past the line"]\n[Site "?"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *\n`,
      ),
    ).unwrap();

    const result = findDeviation(ruyLopez, replay, "white");

    expect(result.inBookPlies).toBe(7); // the whole repertoire matched
    expect(result.event?.type).toBe("book-ended");
    expect(result.event?.actualSan).toBe("Nf6");
    expect(result.event?.expectedMoves).toBeUndefined(); // nothing was ever prepared here
  });

  it("reports every prepared choice when the repertoire has more than one of the owner's own moves", () => {
    const repertoire = repertoireOf(RUY_LOPEZ_MULTI_CHOICE_PGN);
    const replay = replayMainline(
      firstGame(RUY_LOPEZ_MULTI_CHOICE_DEVIATION_GAME_PGN),
    ).unwrap();

    const result = findDeviation(repertoire, replay, "white");

    expect(result.event?.type).toBe("deviation");
    expect([...(result.event?.expectedMoves ?? [])].map((m) => m.san).toSorted()).toEqual(
      ["Bc4", "Nf3"],
    );
  });

  it("recognizes a transposition: a different move order into an already-prepared position still counts as in book", () => {
    const repertoire = repertoireOf(TRANSPOSITION_REPERTOIRE_PGN);
    const replay = replayMainline(firstGame(TRANSPOSITION_GAME_PGN)).unwrap();

    const result = findDeviation(repertoire, replay, "white");

    expect(result.event).toBeNull();
    expect(result.inBookPlies).toBe(4); // Nf3 e5 e4 Nc6 — Nc6 only matches via the mainline's twin node
  });

  it("respects a custom starting FEN when matching a played game", () => {
    const repertoire = repertoireOf(SICILIAN_REPERTOIRE_PGN);
    const replay = replayMainline(firstGame(SICILIAN_IN_BOOK_GAME_PGN)).unwrap();

    const result = findDeviation(repertoire, replay, "black");

    expect(result.event).toBeNull();
    expect(result.inBookPlies).toBe(3);
  });

  it("matches promotion moves by piece, not just from/to", () => {
    const repertoire = repertoireOf(PROMOTION_REPERTOIRE_PGN);

    const inBook = findDeviation(
      repertoire,
      replayMainline(firstGame(PROMOTION_IN_BOOK_GAME_PGN)).unwrap(),
      "white",
    );
    expect(inBook.event).toBeNull();

    const deviation = findDeviation(
      repertoire,
      replayMainline(firstGame(PROMOTION_DEVIATION_GAME_PGN)).unwrap(),
      "white",
    );
    expect(deviation.event?.type).toBe("deviation");
    expect(deviation.event?.expectedMoves).toEqual([
      { move: expect.any(Object), san: "e8=Q" },
    ]);
  });
});
