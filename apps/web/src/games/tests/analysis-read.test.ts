import { describe, expect, it } from "vitest";

import { aGradedPly } from "../../test/games.ts";
import {
  suggestedArrow,
  previewFor,
  seatIdentityOf,
  seatOf,
  badgeForCategory,
  bestMoveSan,
  evalCurve,
  fenAtPly,
  formatBarScore,
  formatScore,
  gradeAtPly,
  progressPercent,
  sideOfPly,
  summarize,
  whiteShareOf,
} from "../analysis-read.ts";
import type { ReplayMove } from "../analysis-contract.ts";

/**
 * The domain rules, without rendering. A screen shows one game, so it
 * walks one path through each rule; the boundaries — ply 0, the last
 * ply, a mate score, an unrecognised SAN — are only checked here.
 */

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const move = (ply: number, san: string): ReplayMove => ({
  ply,
  san,
  fenBefore: `before-${ply}`,
  fenAfter: `after-${ply}`,
});

describe("fenAtPly", () => {
  const moves = [move(1, "e4"), move(2, "e5")];

  it("shows the starting position before anyone has moved", () => {
    expect(fenAtPly(moves, START, 0)).toBe(START);
  });

  it("shows the position after the nth half-move", () => {
    expect(fenAtPly(moves, START, 1)).toBe("after-1");
    expect(fenAtPly(moves, START, 2)).toBe("after-2");
  });

  it("clamps rather than falling off either end", () => {
    // A hand-typed URL or a ply held over from a longer game must not
    // produce an undefined position.
    expect(fenAtPly(moves, START, -5)).toBe(START);
    expect(fenAtPly(moves, START, 99)).toBe("after-2");
  });

  it("survives a game with no legal moves at all", () => {
    expect(fenAtPly([], START, 3)).toBe(START);
  });
});

describe("sideOfPly", () => {
  it("gives odd plies to White and even to Black", () => {
    // The whole seat-attribution of the screen rests on this: get it
    // backwards and every grade lands on the wrong player.
    expect(sideOfPly(1)).toBe("white");
    expect(sideOfPly(2)).toBe("black");
    expect(sideOfPly(7)).toBe("white");
  });
});

describe("formatScore", () => {
  it("reads centipawns as pawns, signed from White's side", () => {
    expect(formatScore({ cp: 140 })).toBe("+1.4");
    expect(formatScore({ cp: -35 })).toBe("−0.3");
    expect(formatScore({ cp: 0 })).toBe("0.0");
  });

  it("says mate rather than converting it to a number of pawns", () => {
    // A mate rendered as centipawns is the bug that makes every other
    // move on the graph look flat.
    expect(formatScore({ mate: 3 })).toBe("M3");
    expect(formatScore({ mate: -2 })).toBe("−M2");
  });

  it("treats an empty score as level", () => {
    expect(formatScore({})).toBe("0.0");
  });
});

describe("summarize", () => {
  it("tallies each grade against the player who played it", () => {
    const graded = [
      aGradedPly(1, { category: "best" }),
      aGradedPly(2, { category: "blunder" }),
      aGradedPly(3, { category: "mistake" }),
      aGradedPly(4, { category: "blunder" }),
    ];

    const breakdown = summarize(graded);

    expect(breakdown.white).toMatchObject({ best: 1, mistake: 1, blunder: 0 });
    expect(breakdown.black).toMatchObject({ best: 0, mistake: 0, blunder: 2 });
    expect(breakdown.graded).toBe(4);
  });

  it("counts nothing before the engine has answered", () => {
    expect(summarize([])).toEqual({
      white: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      black: { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      graded: 0,
    });
  });
});

describe("progressPercent", () => {
  it("reports how much of the game has been graded", () => {
    expect(progressPercent(5, 20)).toBe(25);
    expect(progressPercent(20, 20)).toBe(100);
  });

  it("has nothing to report when the total is unknown", () => {
    // Indeterminate, not zero: a bar pinned at 0% says "stuck", and the
    // ply count is genuinely unknown until the game loads.
    expect(progressPercent(0, 0)).toBeNull();
  });

  it("never exceeds the total, however the stream arrives", () => {
    expect(progressPercent(30, 20)).toBe(100);
  });
});

describe("evalCurve", () => {
  it("turns scores into winning chances, White at the top", () => {
    const curve = evalCurve([
      aGradedPly(1, { evalAfter: { cp: 0 } }),
      aGradedPly(2, { evalAfter: { cp: 900 } }),
      aGradedPly(3, { evalAfter: { cp: -900 } }),
    ]);

    // A level position is the midpoint; a decisive one leans, and is
    // bounded — which is the point of not graphing centipawns.
    expect(curve[0]?.winChance).toBeCloseTo(0.5, 5);
    expect(curve[1]?.winChance).toBeGreaterThan(0.9);
    expect(curve[2]?.winChance).toBeLessThan(0.1);
    expect(curve.every((point) => point.winChance >= 0 && point.winChance <= 1)).toBe(
      true,
    );
  });

  it("takes mate to the ceiling, not to the axis", () => {
    const curve = evalCurve([
      aGradedPly(1, { evalAfter: { mate: 2 } }),
      aGradedPly(2, { evalAfter: { mate: -1 } }),
      // The ceiling itself, reached by centipawns.
      aGradedPly(3, { evalAfter: { cp: 1000 } }),
    ]);

    // This assertion used to read `toBe(1)` and `toBe(0)`, because the
    // curve was implemented twice and this copy saturated. The shared
    // one in `@velachess/analysis` maps mate onto ±1000cp deliberately —
    // it is the behaviour checked against the reference, so it wins.
    // A mate and a crushing-but-finite advantage land on the same point.
    expect(curve[0]?.winChance).toBeCloseTo(curve[2]!.winChance, 10);
    expect(curve[0]?.winChance).toBeLessThan(1);
    expect(curve[1]?.winChance).toBeGreaterThan(0);
    expect(curve[0]!.winChance).toBeGreaterThan(curve[1]!.winChance);
  });

  it("clips beyond the ceiling instead of running away", () => {
    const curve = evalCurve([
      aGradedPly(1, { evalAfter: { cp: 1000 } }),
      aGradedPly(2, { evalAfter: { cp: 100_000 } }),
    ]);

    // Unbounded centipawns are what flattened the graph in the first
    // place; the ceiling is why one absurd score no longer does.
    expect(curve[0]?.winChance).toBeCloseTo(curve[1]!.winChance, 10);
  });
});

describe("bestMoveSan", () => {
  it("turns the engine's UCI answer into notation a person reads", () => {
    const graded = aGradedPly(1, { fen: START, bestMove: "g1f3" });
    expect(bestMoveSan(graded)).toBe("Nf3");
  });

  it("goes quiet rather than throwing on a position it cannot set up", () => {
    // The played move still has to render; only the suggestion drops.
    const graded = aGradedPly(1, { fen: "not a fen", bestMove: "g1f3" });
    expect(bestMoveSan(graded)).toBeNull();
  });

  it("goes quiet on a move that is not legal in the position", () => {
    const graded = aGradedPly(1, { fen: START, bestMove: "e7e5" });
    expect(bestMoveSan(graded)).toBeNull();
  });
});

describe("badgeForCategory", () => {
  it("marks the moves worth stopping on", () => {
    expect(badgeForCategory("blunder")).toEqual({ tone: "blunder", glyph: "??" });
    expect(badgeForCategory("mistake")).toEqual({ tone: "mistake", glyph: "?" });
    expect(badgeForCategory("inaccuracy")).toEqual({
      tone: "inaccuracy",
      glyph: "?!",
    });
    expect(badgeForCategory("best")?.tone).toBe("ok");
  });

  it("leaves a merely solid move unmarked", () => {
    // A badge on every square is a badge on none.
    expect(badgeForCategory("good")).toBeNull();
  });
});

describe("gradeAtPly", () => {
  const graded = [aGradedPly(3), aGradedPly(4)];

  it("finds the verdict by ply, not by position in the array", () => {
    // The array is a prefix while the analysis streams, so its index is
    // not the ply — reading `graded[ply]` would be off by the whole
    // length of what has not arrived yet.
    expect(gradeAtPly(graded, 3)?.ply).toBe(3);
    expect(gradeAtPly(graded, 4)?.ply).toBe(4);
  });

  it("has nothing to say about a ply the engine has not reached", () => {
    expect(gradeAtPly(graded, 9)).toBeUndefined();
  });
});

describe("whiteShareOf", () => {
  it("puts a level position in the middle", () => {
    expect(whiteShareOf({ cp: 0 })).toBeCloseTo(0.5, 10);
  });

  it("leans the way the advantage does, and stays on the scale", () => {
    expect(whiteShareOf({ cp: 500 })).toBeGreaterThan(0.5);
    expect(whiteShareOf({ cp: -500 })).toBeLessThan(0.5);
    expect(whiteShareOf({ mate: 1 })).toBeLessThanOrEqual(1);
    expect(whiteShareOf({ mate: -1 })).toBeGreaterThanOrEqual(0);
  });
});

describe("formatBarScore", () => {
  it("drops the sign, because the bar says the side by where it puts it", () => {
    // The signed reading needed five characters in a bar a fifth that
    // wide, and came out clipped to `+0.` on screen.
    expect(formatBarScore({ cp: 140 })).toBe("1.4");
    expect(formatBarScore({ cp: -140 })).toBe("1.4");
  });

  it("caps the magnitude so it always fits", () => {
    expect(formatBarScore({ cp: 9_999_900 })).toBe("9.9");
    expect(formatBarScore({ cp: -9_999_900 })).toBe("9.9");
  });

  it("says mate rather than a number of pawns", () => {
    expect(formatBarScore({ mate: 3 })).toBe("M3");
    expect(formatBarScore({ mate: -2 })).toBe("M2");
  });

  it("never exceeds three characters, which is what the bar holds", () => {
    const readings = [
      { cp: 0 },
      { cp: -12_345 },
      { cp: 99 },
      { mate: 1 },
      { mate: -99 },
      {},
    ];
    for (const score of readings) {
      expect(formatBarScore(score).length).toBeLessThanOrEqual(3);
    }
  });
});

/**
 * Which seat the board faces.
 *
 * The stored perspective when the import resolved one, and the tracked
 * usernames when it did not. Defaulting to white put anyone who played
 * black behind the wrong pieces on every unlabelled game.
 */
describe("seatOf", () => {
  const game = { perspective: null, whiteName: "magnuscarlsen", blackName: "yurimutti" };

  it("trusts the stored perspective", () => {
    expect(seatOf({ ...game, perspective: "black" }, ["magnuscarlsen"])).toBe("black");
  });

  it("finds your seat from the names when there is none stored", () => {
    expect(seatOf(game, ["yurimutti"])).toBe("black");
  });

  it("matches a username whatever its case", () => {
    // Platforms echo back whatever casing the player typed.
    expect(seatOf(game, ["YuriMutti"])).toBe("black");
  });

  it("faces white when nothing identifies you", () => {
    // A board has to face somewhere, and a game between two strangers
    // has no seat of yours to take.
    expect(seatOf(game, ["someoneelse"])).toBe("white");
    expect(seatOf(game, [])).toBe("white");
  });
});

/**
 * What a seat shows from the identity its payload carried.
 *
 * The server resolves both players from a shared per-handle cache; here
 * a null means "unknown", and unknown means initials, never a broken
 * picture.
 */
describe("seatIdentityOf", () => {
  it("carries the picture and flair a seat resolved to", () => {
    expect(
      seatIdentityOf({ avatarUrl: "https://example.com/pic.jpg", flair: null }),
    ).toEqual({
      avatarUrl: "https://example.com/pic.jpg",
    });
    expect(
      seatIdentityOf({
        avatarUrl: null,
        flair: "people.santa-claus-light-skin-tone",
      }),
    ).toEqual({ flair: "people.santa-claus-light-skin-tone" });
  });

  it("answers nothing for a seat nobody could resolve", () => {
    // Nulls collapse to absence: an initials fallback is rendered by
    // there being no image at all, not by an empty src.
    expect(seatIdentityOf({ avatarUrl: null, flair: null })).toEqual({});
    expect(seatIdentityOf(undefined)).toEqual({});
  });
});

/**
 * Showing the engine's move on the board.
 *
 * Naming a move and then making the person find it is asking them to do
 * the work the screen exists for.
 */
describe("suggestedArrow", () => {
  it("points from where the piece is to where the engine would put it", () => {
    // An arrow, not the resulting position: the board keeps showing the
    // choice the player faced, which is what the panel is describing.
    expect(suggestedArrow(START, "e4")).toEqual({ from: "e2", to: "e4" });
  });

  it("shows nothing when nothing was asked for", () => {
    expect(suggestedArrow(START, null)).toBeNull();
  });

  it("shows nothing at the start, where no move was played yet", () => {
    // The squares come from the position the move was chosen in, and at
    // ply zero there is no such position.
    expect(suggestedArrow(undefined, "e4")).toBeNull();
  });

  it("refuses a move that does not fit the position", () => {
    // A record drifted from its FEN would draw an arrow between squares
    // that mean nothing.
    expect(suggestedArrow(START, "Nf6")).toBeNull();
  });
});

describe("previewFor", () => {
  it("keeps the preview on the ply it was asked for", () => {
    expect(previewFor({ ply: 4, san: "d4" }, 4)).toBe("d4");
  });

  it("drops it as soon as the board steps anywhere", () => {
    // Tying it to a ply is what dismisses it: no control has to remember
    // to clear anything, so none of them can forget.
    expect(previewFor({ ply: 4, san: "d4" }, 5)).toBeNull();
    expect(previewFor({ ply: 4, san: "d4" }, 3)).toBeNull();
  });

  it("has nothing to show when none was asked for", () => {
    expect(previewFor(null, 4)).toBeNull();
  });
});
