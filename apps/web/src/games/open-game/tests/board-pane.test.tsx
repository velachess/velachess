// @vitest-environment jsdom
import { I18nProvider } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { i18n } from "../../../i18n/index.ts";
import { aGradedPly } from "../../../test/games.ts";
import { BoardPane, type BoardPaneProps } from "../board-pane.tsx";

/** `BoardPane` only reads from lingui's context — none of its children
 * (Button, EvalBar, PlayerStrip) depend on a theme or tooltip provider. */
function renderWithI18n(ui: ReactNode) {
  return render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);
}

const FEN_AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const SEAT = {
  name: "Player",
  rating: undefined,
  avatarUrl: undefined,
  flair: undefined,
};

function baseProps(overrides: Partial<BoardPaneProps> = {}): BoardPaneProps {
  return {
    fen: FEN_AFTER_E4,
    orientation: "white",
    move: undefined,
    playedGrade: undefined,
    positionGrade: aGradedPly(1, { fen: FEN_AFTER_E4, bestMove: "e7e5" }),
    suggestedMove: undefined,
    onMove: undefined,
    legalTargetsOf: undefined,
    exploringMove: undefined,
    exploringCategory: undefined,
    onExitExploration: undefined,
    top: SEAT,
    bottom: SEAT,
    ...overrides,
  };
}

describe("BoardPane", () => {
  it("renders with no exploration banner when not exploring", () => {
    renderWithI18n(<BoardPane {...baseProps()} />);

    expect(screen.queryByText("Back to the game")).not.toBeInTheDocument();
  });

  it("shows the exploring banner and its verdict once a category is known", () => {
    renderWithI18n(
      <BoardPane
        {...baseProps({
          exploringMove: { from: "e2", to: "e4" },
          exploringCategory: "blunder",
        })}
      />,
    );

    expect(screen.getByText("Blunder", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to the game" })).toBeInTheDocument();
  });

  it("shows the evaluating copy while exploring with no verdict yet", () => {
    renderWithI18n(
      <BoardPane {...baseProps({ exploringMove: { from: "e2", to: "e4" } })} />,
    );

    expect(screen.getByText("Evaluating…", { exact: false })).toBeInTheDocument();
  });

  it("calls onExitExploration when the exit button is clicked", async () => {
    const onExitExploration = vi.fn();
    const user = userEvent.setup();

    renderWithI18n(
      <BoardPane
        {...baseProps({
          exploringMove: { from: "e2", to: "e4" },
          exploringCategory: "blunder",
          onExitExploration,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Back to the game" }));
    expect(onExitExploration).toHaveBeenCalledOnce();
  });
});
