import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { BoardPanel } from "@velachess/ui/chess/board-stage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@velachess/ui/components/tabs";

import { evalCurve, summarize } from "../analysis-read.ts";
import { AnalysisStatus } from "../request-analysis/analysis-status.tsx";
import { EvalGraph } from "../view-analysis/eval-graph.tsx";
import { DrillCta } from "../view-analysis/drill-cta.tsx";
import { GameReport } from "../view-analysis/game-report.tsx";
import { GameResult } from "./game-result.tsx";
import { MoveInsight } from "../view-analysis/move-insight.tsx";
import { MoveList } from "./move-list.tsx";
import type { DrillCount, GradedPly, ReplayableGame } from "../analysis-contract.ts";
import { ReplayControls } from "./replay-controls.tsx";
import type { ChessReplay } from "./use-chess-replay.ts";

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
  replay: ChessReplay;
  graded: GradedPly[];
  /** What the report's drill CTA counts. Absent until analysis lands. */
  drills: DrillCount | undefined;
  /** Show the engine's move on the board, from the Move tab. */
  onShowBest: (san: string) => void;
  isAnalyzing: boolean;
  hasFailed: boolean;
  /** The wait, when the failure is the rate limit and not a defect. */
  retryAfterSeconds: number | null;
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
export function AnalysisPanel({
  game,
  replay,
  graded,
  drills,
  onShowBest,
  isAnalyzing,
  hasFailed,
  retryAfterSeconds,
}: AnalysisPanelProps) {
  const { i18n } = useLingui();
  const breakdown = summarize(graded);

  return (
    <BoardPanel label={i18n._(PANEL_COPY.region)}>
      <div className="shrink-0 border-b p-3">
        <EvalGraph
          points={evalCurve(graded)}
          totalPlies={replay.totalPlies}
          selectedPly={replay.ply}
          onSelectPly={replay.goTo}
        />
      </div>

      <AnalysisStatus
        graded={breakdown.graded}
        totalPlies={replay.totalPlies}
        isAnalyzing={isAnalyzing}
        hasFailed={hasFailed}
        retryAfterSeconds={retryAfterSeconds}
      />

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
          <MoveInsight
            move={replay.moves[replay.ply - 1]}
            graded={graded[replay.ply - 1]}
            onShowBest={onShowBest}
          />
          <MoveList
            moves={replay.moves}
            graded={graded}
            currentPly={replay.ply}
            onSelectPly={replay.goTo}
            whiteName={game.whiteName}
            blackName={game.blackName}
          />
        </TabsContent>

        <TabsContent value={TABS.report} className="min-h-0 flex-1 overflow-y-auto">
          <GameReport
            breakdown={breakdown}
            whiteName={game.whiteName}
            blackName={game.blackName}
            openingName={game.openingName}
            openingEco={game.openingEco}
          />
          <div className="p-4 pt-0">
            <DrillCta drills={drills} />
          </div>
        </TabsContent>
      </Tabs>

      <GameResult result={game.result} termination={game.termination} />

      <ReplayControls replay={replay} />
    </BoardPanel>
  );
}
