import { describe, expect, it } from "vitest";

import {
  legalTargetsAt,
  sanOfUciAt,
  seatIdentityOf,
  seatOf,
  suggestedArrow,
} from "../board-view.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

describe("legalTargetsAt", () => {
  it("offers every square the piece on it can reach", () => {
    expect(legalTargetsAt(START, "e2").map((target) => target.square)).toEqual([
      "e3",
      "e4",
    ]);
  });

  it("offers nothing for the side that is not to move", () => {
    // The board must not draw a dot the move then refuses: a variation is
    // a game being played, and it is White's turn.
    expect(legalTargetsAt(START, "e7")).toEqual([]);
  });

  it("has nothing to offer from an empty square", () => {
    expect(legalTargetsAt(START, "e4")).toEqual([]);
  });

  it("stays quiet on a position it cannot set up, rather than throwing", () => {
    expect(legalTargetsAt("not a fen", "e2")).toEqual([]);
  });
});

describe("sanOfUciAt", () => {
  it("turns the engine's UCI answer into notation a person reads", () => {
    expect(sanOfUciAt(START, "g1f3")).toBe("Nf3");
  });

  it("goes quiet rather than throwing on a position it cannot set up", () => {
    // The played move still has to render; only the suggestion drops.
    expect(sanOfUciAt("not a fen", "g1f3")).toBeNull();
  });

  it("goes quiet on a move that is not legal in the position", () => {
    expect(sanOfUciAt(START, "e7e5")).toBeNull();
  });

  it("goes quiet when the engine named no move at all", () => {
    expect(sanOfUciAt(START, "")).toBeNull();
  });
});
