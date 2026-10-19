import { describe, expect, it } from "vitest";

import { previewFor, seatIdentityOf, seatOf, suggestedArrow } from "../board-view.ts";

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
