import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GradedPly, PositionEvaluation } from "@velachess/analysis";
import type { MoveSquares } from "@velachess/chess";

import { addGames } from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { aGame, aGradedPly } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import { ANALYSIS_EVENT, type AnalysisEvent } from "../../analysis/index.ts";

/**
 * What the review hands the board, and how often. The boundary is
 * counted here rather than a hook's renders, because 64 squares is what
 * costs anything.
 */
let boardRenders = 0;
let suggestedMove: MoveSquares | null | undefined;

vi.mock("@velachess/ui/chess/board", () => ({
  Board: (props: {
    suggestedMove?: MoveSquares | null | undefined;
    onMove?: (move: MoveSquares) => void;
  }) => {
    boardRenders += 1;
    suggestedMove = props.suggestedMove;
    // A button rather than a div: playing a variation goes through the
    // real board's `onMove`.
    return (
      <button
        type="button"
        data-testid="board"
        aria-label="board"
        onClick={() => props.onMove?.({ from: "e2", to: "e4" })}
      />
    );
  },
}));

vi.mock("../../analysis/game/analyze.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));
const { analyzeGameInBrowser } = await import("../../analysis/game/analyze.ts");

vi.mock("../../analysis/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analysis/index.ts")>()),
  createStockfishEvaluator: vi.fn(),
}));
const { createStockfishEvaluator } = await import("../../analysis/index.ts");

/** One variation search the test answers when it chooses. */
function stagedSearch(evaluation: PositionEvaluation) {
  let answer!: () => void;
  const settled = new Promise<PositionEvaluation>((resolve) => {
    answer = () => resolve(evaluation);
  });

  async function* search() {
    yield { depth: 4, multipv: 1, score: evaluation.score, pv: ["e7e5"] };
    return await settled;
  }

  vi.mocked(createStockfishEvaluator).mockReturnValue({
    evaluate: () => Object.assign(search(), { cancel: () => {} }),
    dispose: async () => {},
  });

  return { answer: () => answer() };
}

const evaluationReads = () =>
  screen.getByRole("meter", { name: "Evaluation" }).getAttribute("aria-valuetext");

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
    suggestedMove = undefined;
    vi.mocked(analyzeGameInBrowser).mockReset();
    vi.mocked(createStockfishEvaluator).mockReset();
  });

  it("leaves the board alone while the engine deepens its search", async () => {
    const pass = stagedPass();
    const game = aGame();
    addGames(game);
    await renderApp({ path: `/games/${game.id}` });

    // Measured from the first reading: the board is drawn once more when
    // the analysis exists at all, and not again for a deeper search.
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

describe("the engine's move someone asked to see", () => {
  beforeEach(() => {
    deviceHasImported();
    boardRenders = 0;
    suggestedMove = undefined;
    vi.mocked(analyzeGameInBrowser).mockReset();
    vi.mocked(createStockfishEvaluator).mockReset();
  });

  it("reaches the board as an arrow, and is gone again on the next move", async () => {
    const pass = stagedPass();
    const game = aGame();
    addGames(game);
    const { user } = await renderApp({ path: `/games/${game.id}` });

    // d4 rather than the e4 that was played, so the card has something
    // to offer in the first place.
    pass.grade(aGradedPly(1, { category: "inaccuracy", bestMove: "d2d4" }));
    const played = await screen.findByRole("button", {
      name: (content) => content.includes("e4") && content.includes("?!"),
    });
    await user.click(played);
    expect(suggestedMove).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Show the engine's move on the board" }),
    );
    // The squares come from the report's UCI, not from a copy of the move
    // in the review's state.
    expect(suggestedMove).toEqual({ from: "d2", to: "d4" });

    await user.click(screen.getByRole("button", { name: "Previous move" }));
    expect(suggestedMove).toBeNull();
  });

  it("leaves the board alone when a variation's evaluation lands", async () => {
    const search = stagedSearch({ score: { cp: -480 }, bestMove: "e7e5" });
    stagedPass();
    const game = aGame();
    addGames(game);
    const { user } = await renderApp({ path: `/games/${game.id}` });

    await screen.findByTestId("board");
    // Playing the line redraws the board, which is its own position
    // changing; the number that follows is the bar's alone.
    await user.click(screen.getByTestId("board"));
    await screen.findByRole("button", { name: "Next move" });
    const drawn = boardRenders;

    search.answer();
    await vi.waitFor(() => expect(evaluationReads()).toBe("4.8"));

    expect(boardRenders).toBe(drawn);
  });
});
