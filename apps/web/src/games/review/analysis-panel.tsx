import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { BoardPanel } from "@velachess/ui/chess/board-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@velachess/ui/components/tabs";

import type { GradedPly } from "../analysis/index.ts";

import { useQuery } from "../../libs/react-query.ts";
import { AnalysisProgress } from "./analysis-progress.tsx";
import { EvalGraph } from "./eval-graph.tsx";
import { gameAnalysisQuery, selectGraded } from "./game-analysis-query.ts";
import type { ReplayableGame } from "./game-record.ts";
import { GameReport } from "./game-report.tsx";
import { GameResult } from "./game-result.tsx";
import { MoveInsight } from "./move-insight.tsx";
import { MoveList } from "./move-list.tsx";
import { ReplayControls } from "./replay-controls.tsx";
import { gradeAtPly, selectGameMove } from "./review-model.ts";
import { useGameReview } from "./use-game-review.ts";

const PANEL_COPY = {
  move: msg`Move`,
  report: msg`Report`,
  /** A landmark's name is read aloud, so it is copy like any other. */
  region: msg`Review`,
} as const;

/** Tab ids are keys, never copy — the label is translated, this is not. */
const TABS = { move: "move", report: "report" } as const;

export interface AnalysisPanelProps {
  game: ReplayableGame;
}

/**
 * Everything that is not the board.
 *
 * The curve, the result and the controls are permanent — a long game
 * must never scroll the buttons out of reach. Between them sit two tabs
 * answering two different questions, each owning its own content and its
 * own scrolling:
 *
 *   Move    what happened here — verdict plus the scoresheet, which is
 *           the working surface while stepping through
 *   Report  how the game went — opening, the tally, and the way out
 *
 * The scoresheet used to live outside the tabs, on the argument that it
 * "must never be a click away". True while reading a move; false while
 * reading the report, where a move-by-move list is noise underneath a
 * summary — and the two then fought over one scroll region.
 */
const NOTHING_GRADED: readonly GradedPly[] = [];

export function AnalysisPanel({ game }: AnalysisPanelProps) {
  const { i18n } = useLingui();

  // The grades that have landed, and nothing provisional: a deepening
  // search redraws the bar inside `AnalysisProgress`, not this panel.
  const analysis = useQuery({ ...gameAnalysisQuery(game), select: selectGraded });
  const graded = analysis.data ?? NOTHING_GRADED;

  // `inVariation`: the main line's verdict is then about a position
  // nobody is looking at, so it is not shown at all rather than shown as
  // if it belonged to the move someone just played.
  const ply = useGameReview((state) => state.ply);
  const move = useGameReview((state) => selectGameMove(state, game));
  const inVariation = useGameReview((state) => state.variation !== null);
  const goToPly = useGameReview((state) => state.goToPly);
  const revealBestMove = useGameReview((state) => state.revealBestMove);

  // The axis the curve and the bar are drawn against, read from the
  // replay rather than subscribed to: a game's length never changes.
  const totalPlies = game.moves.length;

  return (
    <BoardPanel label={i18n._(PANEL_COPY.region)}>
      <div className="shrink-0 border-b p-3">
        <EvalGraph
          graded={graded}
          totalPlies={totalPlies}
          selectedPly={ply}
          onSelectPly={goToPly}
        />
      </div>

      <AnalysisProgress game={game} totalPlies={totalPlies} />

      {/*
        Each tab owns everything it needs, including its own scrolling.

        The scoresheet used to sit outside, always visible — which meant
        reading the report came with a move-by-move list underneath that
        had nothing to do with it. It also made the two tabs share one
        scroll region, so the report's rows pushed the list around.

        `min-h-0` on both the tabs and the content is what lets a flex
        child actually shrink; without it the list grows the panel
        instead of scrolling inside it.
      */}
      <Tabs defaultValue={TABS.move} className="flex min-h-0 flex-1 flex-col pt-3">
        {/* A flex column here, so centring is `self-center`, not a wrapper. */}
        <TabsList className="shrink-0 self-center">
          <TabsTrigger value={TABS.move}>{i18n._(PANEL_COPY.move)}</TabsTrigger>
          <TabsTrigger value={TABS.report}>{i18n._(PANEL_COPY.report)}</TabsTrigger>
        </TabsList>

        <TabsContent value={TABS.move} className="flex min-h-0 flex-1 flex-col">
          {!inVariation && (
            <MoveInsight
              move={move}
              graded={gradeAtPly(graded, ply)}
              onRevealBestMove={revealBestMove}
            />
          )}
          <MoveList
            graded={graded}
            moves={game.moves}
            whiteName={game.whiteName}
            blackName={game.blackName}
          />
        </TabsContent>

        <TabsContent value={TABS.report} className="min-h-0 flex-1 overflow-y-auto">
          <GameReport
            graded={graded}
            moves={game.moves}
            whiteName={game.whiteName}
            blackName={game.blackName}
            openingName={game.openingName}
            openingEco={game.openingEco}
          />
        </TabsContent>
      </Tabs>

      <GameResult result={game.result} termination={game.termination} />

      <ReplayControls game={game} />
    </BoardPanel>
  );
}
