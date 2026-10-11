/**
 * Which seat was yours. The review screen is the live caller; the same
 * rule is expressed as SQL in `libs/infra/db` and pinned there by
 * `tests/game-perspective.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { resolveGamePerspective } from "@velachess/chess";

const game = { perspective: null, whiteName: "magnuscarlsen", blackName: "yurimutti" };

describe("resolveGamePerspective", () => {
  it("trusts a stored perspective over the names", () => {
    // A manual import already asked the uploader which side was theirs.
    expect(resolveGamePerspective({ ...game, perspective: "white" }, ["yurimutti"])).toBe(
      "white",
    );
  });

  it("ignores a stored value that is not a seat", () => {
    expect(resolveGamePerspective({ ...game, perspective: "" }, ["yurimutti"])).toBe(
      "black",
    );
  });

  it("matches one handle — the shape a server read hands it", () => {
    expect(resolveGamePerspective(game, ["yurimutti"])).toBe("black");
    expect(resolveGamePerspective(game, ["magnuscarlsen"])).toBe("white");
  });

  it("matches any of several handles — the shape the review screen hands it", () => {
    expect(resolveGamePerspective(game, ["someoneelse", "yurimutti"])).toBe("black");
  });

  it("folds case and surrounding space: platforms echo what the player typed", () => {
    expect(resolveGamePerspective(game, ["YuriMutti"])).toBe("black");
    expect(resolveGamePerspective(game, [" yurimutti "])).toBe("black");
  });

  it("answers black for a game you played against yourself", () => {
    const selfGame = { ...game, whiteName: "yurimutti", blackName: "yurimutti" };
    expect(resolveGamePerspective(selfGame, ["yurimutti"])).toBe("black");
  });

  it("answers null when nothing attributes the game", () => {
    expect(resolveGamePerspective(game, ["someoneelse"])).toBeNull();
    expect(resolveGamePerspective(game, [])).toBeNull();
    expect(resolveGamePerspective(game, [null, undefined, ""])).toBeNull();
  });
});
