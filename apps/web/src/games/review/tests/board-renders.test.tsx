import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GradedPly } from "@velachess/analysis";

import { addGames } from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { aGame, aGradedPly } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import { ANALYSIS_EVENT, type AnalysisEvent } from "../../analysis/index.ts";

/**
 * Where the analysis stops: the board is a 64-square third-party widget,
 * and the whole point of reading the report through `select` is that a
 * deepening search and a grade for some other move never reach it. The
 * boundary is counted here rather than a hook's renders, because the
 * boundary is what costs anything.
 */
let boardRenders = 0;

vi.mock("@velachess/ui/chess/board", () => ({
  Board: () => {
    boardRenders += 1;
    return <div data-testid="board" />;
  },
}));

vi.mock("../../analysis/game/analyze.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));
const { analyzeGameInBrowser } = await import("../../analysis/game/analyze.ts");

function stagedPass() {
  const events: AnalysisEvent[] = [];
  let resume: (() => void) | null = null;

  function wake() {
    const resumeNow = resume;
    resume = null;
    resumeNow?.();
  }

  vi.mocked(analyzeGameInBrowser).mockImplementation(async function* () {
    let index = 0;
    while (true) {
      while (index < events.length) yield events[index++]!;
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
    }
  });

  return {
    searching(ply: number, depth: number) {
      events.push({
        type: ANALYSIS_EVENT.POSITION_UPDATE,
        live: {
          ply,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          update: { depth, multipv: 1, score: { cp: 8 }, pv: ["e2e4"] },
        },
      });
      wake();
    },
    grade(grade: GradedPly) {
      events.push({ type: ANALYSIS_EVENT.PLY_GRADED, grade });
      wake();
    },
  };
}

describe("what the analysis re-renders", () => {
  beforeEach(() => {
    deviceHasImported();
    boardRenders = 0;
    vi.mocked(analyzeGameInBrowser).mockReset();
  });

  it("leaves the board alone while the engine deepens its search", async () => {
    const pass = stagedPass();
    const game = aGame();
    addGames(game);
    await renderApp({ path: `/games/${game.id}` });

    // Measured from the first reading, not from the empty one: the board
    // is drawn once more when the analysis exists at all, and after that
    // a deepening search must not touch it.
    await screen.findByTestId("board");
    pass.searching(1, 4);
    await screen.findByText(/depth 4/);
    const drawn = boardRenders;

    pass.searching(1, 9);
    await screen.findByText(/depth 9/);
    pass.searching(1, 14);
    await screen.findByText(/depth 14/);

    expect(boardRenders).toBe(drawn);
  });

  it("leaves the board alone for a grade it does not draw", async () => {
    const pass = stagedPass();
    const game = aGame();
    addGames(game);
    const { user } = await renderApp({ path: `/games/${game.id}` });

    // Someone reading the end of the game while the engine is still on
    // the opening: those grades are the scoresheet's, not the board's.
    await screen.findByTestId("board");
    await user.click(screen.getByRole("button", { name: /Qxf7#/ }));
    pass.grade(aGradedPly(1, { category: "inaccuracy" }));
    await screen.findByRole("button", {
      name: (content) => content.includes("e4") && content.includes("?!"),
    });
    const drawn = boardRenders;

    pass.grade(aGradedPly(2, { category: "blunder" }));
    await screen.findByRole("button", {
      name: (content) => content.includes("e5") && content.includes("??"),
    });
    pass.grade(aGradedPly(3, { category: "mistake" }));
    await screen.findByRole("button", {
      name: (content) => content.includes("Qh5") && content.includes("?"),
    });

    expect(boardRenders).toBe(drawn);
  });

  it("redraws the board for the grade of the move it is showing", async () => {
    const pass = stagedPass();
    const game = aGame();
    addGames(game);
    await renderApp({ path: `/games/${game.id}` });

    await screen.findByTestId("board");
    const drawn = boardRenders;

    pass.grade(aGradedPly(1, { category: "blunder", bestMove: "d2d4" }));
    await screen.findByRole("button", {
      name: (content) => content.includes("e4") && content.includes("??"),
    });

    expect(boardRenders).toBeGreaterThan(drawn);
  });
});
