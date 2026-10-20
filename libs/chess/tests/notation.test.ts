import { FOOLS_MATE_CHECKMATE, STARTING_POSITION } from "@velachess/fixtures";
import { describe, expect, it } from "vitest";

import {
  makeSan,
  makeSanVariation,
  moveNumberOf,
  parseSan,
  parseSquare,
  positionFromFen,
  sideOfPly,
} from "@velachess/chess";

describe("SAN", () => {
  it("parses a SAN move against a position", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    const move = parseSan(pos, "e4");
    expect(move).toEqual({ from: parseSquare("e2"), to: parseSquare("e4") });
  });

  it("returns undefined for an illegal SAN move, rather than throwing", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    expect(parseSan(pos, "e5")).toBeUndefined();
  });

  it("writes SAN without mutating the position passed in", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    const move = { from: parseSquare("e2")!, to: parseSquare("e4")! };

    const san = makeSan(pos, move);

    expect(san).toBe("e4");
    // san() reads the position; it doesn't advance it.
    expect(pos.turn).toBe("white");
  });

  it("appends # for a mating move", () => {
    const pos = positionFromFen(STARTING_POSITION).unwrap();
    const variation = [
      { from: parseSquare("f2")!, to: parseSquare("f3")! },
      { from: parseSquare("e7")!, to: parseSquare("e5")! },
      { from: parseSquare("g2")!, to: parseSquare("g4")! },
      { from: parseSquare("d8")!, to: parseSquare("h4")! },
    ];

    expect(makeSanVariation(pos, variation)).toBe("1. f3 e5 2. g4 Qh4#");
  });

  it("agrees with the FOOLS_MATE_CHECKMATE fixture", () => {
    const pos = positionFromFen(FOOLS_MATE_CHECKMATE).unwrap();
    expect(pos.isCheckmate()).toBe(true);
  });
});

describe("plies", () => {
  it("gives odd plies to White and even to Black", () => {
    expect(sideOfPly(1)).toBe("white");
    expect(sideOfPly(2)).toBe("black");
    expect(sideOfPly(7)).toBe("white");
  });

  it("pairs each two plies under one move number", () => {
    expect(moveNumberOf(1)).toBe(1);
    expect(moveNumberOf(2)).toBe(1);
    expect(moveNumberOf(3)).toBe(2);
    expect(moveNumberOf(0)).toBe(0);
  });
});
