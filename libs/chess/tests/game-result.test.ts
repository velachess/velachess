/**
 * The outcome rule, as its own unit. Expectations are written out, never
 * computed from the rule under test. The same cases are pinned over HTTP
 * in `apps/server/tests/library-filters.test.ts`, which is what keeps
 * the SQL filter and this function in agreement.
 */
import { describe, expect, it } from "vitest";

import { gameOutcomeFor } from "@velachess/chess";

describe("outcome from the player's seat", () => {
  it("reads a decided result from the seat the player had", () => {
    expect(gameOutcomeFor("1-0", "white")).toBe("win");
    expect(gameOutcomeFor("0-1", "black")).toBe("win");
    expect(gameOutcomeFor("0-1", "white")).toBe("loss");
    expect(gameOutcomeFor("1-0", "black")).toBe("loss");
  });

  it("calls a draw a draw from either seat", () => {
    expect(gameOutcomeFor("1/2-1/2", "white")).toBe("draw");
    expect(gameOutcomeFor("1/2-1/2", "black")).toBe("draw");
  });

  it("answers draw with no seat at all: the result alone settles it", () => {
    expect(gameOutcomeFor("1/2-1/2", null)).toBe("draw");
  });

  it("refuses to name a winner when the seat is unknown", () => {
    expect(gameOutcomeFor("1-0", null)).toBe("unfinished");
    expect(gameOutcomeFor("0-1", null)).toBe("unfinished");
  });

  it("treats a game still in progress as unfinished from either seat", () => {
    expect(gameOutcomeFor("*", "white")).toBe("unfinished");
    expect(gameOutcomeFor("*", "black")).toBe("unfinished");
    expect(gameOutcomeFor("*", null)).toBe("unfinished");
  });
});
