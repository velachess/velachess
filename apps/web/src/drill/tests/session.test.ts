import { describe, expect, it } from "vitest";

import { advanced, boardFen, toGoIn, verdictArrows, type Session } from "../session.ts";
import { drillItem } from "../../test/handlers/drill.ts";

/**
 * The repetition loop, as arithmetic.
 *
 * This is the rule that makes a hint unnecessary: a missed position comes
 * back before the sitting ends, so being asked again *is* the help. If
 * these are wrong the counters lie about work that will never arrive.
 */
const other = { ...drillItem, exerciseId: "22222222-2222-2222-2222-222222222222" };

const sitting = (over: Partial<Session> = {}): Session => ({
  size: 3,
  right: 0,
  wrong: 0,
  retry: [],
  ...over,
});

describe("session", () => {
  it("retires a position that was answered right", () => {
    const after = advanced(sitting(), drillItem, { expectedSans: ["d4"], correct: true });

    expect(after.right).toBe(1);
    expect(after.retry).toEqual([]);
    expect(toGoIn(after)).toBe(2);
  });

  it("sends a missed position to the back of the sitting", () => {
    const after = advanced(sitting(), drillItem, {
      expectedSans: ["d4"],
      correct: false,
    });

    expect(after.wrong).toBe(1);
    expect(after.retry).toEqual([drillItem]);
    // Still owed: answering wrong does not get a position out of the way.
    expect(toGoIn(after)).toBe(3);
  });

  it("keeps a position owed until it is answered right", () => {
    const missed = advanced(sitting(), drillItem, {
      expectedSans: ["d4"],
      correct: false,
    });
    const again = advanced(missed, drillItem, { expectedSans: ["d4"], correct: false });

    // Two misses of one position: two misses counted, one position owed.
    expect(again.wrong).toBe(2);
    expect(toGoIn(again)).toBe(3);
  });

  it("counts a miss even when the answer never arrived", () => {
    // Leaving mid-position is not a right answer, so it does not retire.
    const after = advanced(sitting(), drillItem, null);

    expect(after.retry).toEqual([drillItem]);
    expect(toGoIn(after)).toBe(3);
  });

  it("queues misses in the order they happened", () => {
    const first = advanced(sitting(), drillItem, {
      expectedSans: ["d4"],
      correct: false,
    });
    const second = advanced(first, other, { expectedSans: ["d4"], correct: false });

    expect(second.retry.map((item) => item.exerciseId)).toEqual([
      drillItem.exerciseId,
      other.exerciseId,
    ]);
  });

  it("never owes less than nothing", () => {
    // The retry queue can outlive the original count, and a negative
    // "to go" would render as a number nobody can act on.
    const done = sitting({ size: 1, right: 3 });

    expect(toGoIn(done)).toBe(0);
  });
});

/**
 * What the board shows once an answer lands.
 *
 * The two cases are opposites, and treating them alike was a bug: a right
 * answer was rewound to draw an arrow at the square the piece had already
 * reached, undoing the move the person had just played correctly.
 */
describe("verdict", () => {
  const FEN = "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1";
  const item = { ...drillItem, fen: FEN };

  it("leaves a right move on the board, lit and marked", () => {
    const shown = verdictArrows(item, {
      fen: "after",
      san: "Nxe5",
      answer: { expectedSans: ["Nxe5"], correct: true },
    });

    expect(shown.lastMove).toEqual({ from: "f3", to: "e5" });
    expect(shown.badges?.["e5"]?.tone).toBe("ok");
    // Nothing to contrast a correct move with.
    expect(shown.playedMove).toBeUndefined();
    expect(shown.bestMove).toBeUndefined();
  });

  it("draws both arrows when the move was wrong", () => {
    const shown = verdictArrows(item, {
      fen: "after",
      san: "Nxe5",
      answer: { expectedSans: ["Nc3"], correct: false },
    });

    expect(shown.playedMove).toEqual({ from: "f3", to: "e5" });
    expect(shown.bestMove).toEqual({ from: "b1", to: "c3" });
    expect(shown.badges).toBeUndefined();
  });

  it("shows nothing before an answer", () => {
    expect(verdictArrows(item, null)).toEqual({});
    expect(verdictArrows(item, { fen: "x", san: "Nxe5", answer: null })).toEqual({});
  });
});

/**
 * Which position the board shows while an answer is in flight, and after.
 *
 * Extracted because getting it wrong is invisible to a type checker and
 * obvious to a person: the piece jumped to its square and came back.
 */
describe("boardFen", () => {
  const asked = "asked-fen";
  const after = "after-fen";

  it("holds the position as asked until the answer arrives", () => {
    expect(boardFen(asked, { fen: after, san: "Nxe5", answer: null })).toBe(asked);
  });

  it("holds it too when the answer says the move was wrong", () => {
    // The arrows are drawn against this position; a piece that left and
    // returned would have been asserting a move and taking it back.
    const wrong = { expectedSans: ["Nc3"], correct: false };
    expect(boardFen(asked, { fen: after, san: "Nxe5", answer: wrong })).toBe(asked);
  });

  it("lands the move once it is known to be right", () => {
    const right = { expectedSans: ["Nxe5"], correct: true };
    expect(boardFen(asked, { fen: after, san: "Nxe5", answer: right })).toBe(after);
  });

  it("shows the asked position when nothing has been tried", () => {
    expect(boardFen(asked, null)).toBe(asked);
  });
});
