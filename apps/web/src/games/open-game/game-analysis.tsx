import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { BOARD_STAGE_WIDTH, BoardStage } from "@velachess/ui/chess/board-stage";
import { Empty, EmptyDescription, EmptyHeader } from "@velachess/ui/components/empty";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { cn } from "@velachess/ui/lib/utils";

import { BoardScreen } from "../../app-shell/board-screen.tsx";
import { useMyAccounts } from "../import/my-accounts.ts";
import { gradeAtPly, previewFor, seatOf, suggestedArrow } from "../analysis-read.ts";
import { BoardPane } from "./board-pane.tsx";
import { AnalysisPanel } from "./analysis-panel.tsx";
import { useAnalysis } from "../watch-analysis/use-analysis.ts";

const ANALYSE_COPY = {
  loading: msg`Loading the game…`,
  loadError: msg`Couldn't load analysis.`,
  matchup: msg`{white} vs {black}`,
} as const;

const SCORESHEET_SKELETON_CELLS = Array.from(
  { length: 24 },
  (_, index) => `scoresheet-cell-${index}`,
);

/**
 * Read the id, hand off to a component keyed by the game. The key is
 * load-bearing: `ply` belongs to *this* game, and remounting resets it
 * without an effect watching `gameId`.
 */
export function GameAnalysis() {
  // strict: false so it mounts under both the generated route tree and
  // the hand-built one in tests.
  const { gameId = "" } = useParams({ strict: false });
  return <GameAnalysisContent key={gameId} gameId={gameId} />;
}

function GameAnalysisContent({ gameId }: { gameId: string }) {
  const { i18n } = useLingui();
  // The array itself, mapped where it is used: a selector that builds a
  // new array every render never compares equal, and zustand re-renders
  // until React gives up.
  const myAccounts = useMyAccounts((state) => state.accounts);
  /**
   * The engine's move, shown on the board.
   *
   * Tagged with the ply it belongs to, so stepping anywhere invalidates
   * it without anything having to clear it. The alternative — a callback
   * on every control that can navigate — is four places to forget.
   */
  const [preview, setPreview] = useState<{ ply: number; san: string } | null>(null);

  const {
    game,
    isLoading,
    hasFailed,
    replay,
    drills,
    graded,
    isAnalyzing,
    analysisFailed,
  } = useAnalysis(gameId);

  // Ignored while a form field has focus (react-hotkeys-hook default) —
  // an arrow key stepping the board while someone types elsewhere would
  // be the wrong kind of clever.
  useHotkeys("left", () => replay.previous(), { preventDefault: true }, [replay]);
  useHotkeys("right", () => replay.next(), { preventDefault: true }, [replay]);

  if (isLoading) {
    return <AnalysisSkeleton label={i18n._(ANALYSE_COPY.loading)} />;
  }

  if (hasFailed || !game) {
    return (
      <div className="p-6">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyDescription>{i18n._(ANALYSE_COPY.loadError)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const seat = (name: string, rating: number | null) => ({
    name,
    rating: rating === null ? undefined : i18n.number(rating),
  });
  const white = seat(game.whiteName, game.whiteRating);
  const black = seat(game.blackName, game.blackRating);

  const orientation = seatOf(
    game,
    myAccounts.map((account) => account.username),
  );
  // The move just played, and the choice facing whoever is to move now.
  const playedGrade = gradeAtPly(graded, replay.ply);
  const positionGrade = gradeAtPly(graded, replay.ply + 1);
  const matchup = i18n._({
    ...ANALYSE_COPY.matchup,
    values: { white: white.name, black: black.name },
  });
  const top = orientation === "white" ? black : white;
  const bottom = orientation === "white" ? white : black;

  return (
    <BoardScreen page={matchup}>
      <BoardPane
        fen={replay.fen}
        orientation={orientation}
        move={replay.moves[replay.ply - 1]}
        playedGrade={playedGrade}
        positionGrade={positionGrade}
        // Squares are absolute, so the arrow can be drawn on the board
        // as it stands. What needs the earlier position is turning the
        // SAN into squares — `Bf5` names a bishop that has since moved
        // — so the translation reads `fenBefore` and the board is left
        // exactly as it was. Pointing is not playing.
        suggestedMove={
          suggestedArrow(
            replay.moves[replay.ply - 1]?.fenBefore,
            previewFor(preview, replay.ply),
          ) ?? undefined
        }
        top={top}
        bottom={bottom}
      />

      <AnalysisPanel
        drills={drills}
        onShowBest={(san) => setPreview({ ply: replay.ply, san })}
        game={game}
        replay={replay}
        graded={graded}
        isAnalyzing={isAnalyzing}
        hasFailed={analysisFailed}
      />
    </BoardScreen>
  );
}

function AnalysisSkeleton({ label }: { label: string }) {
  return (
    <output
      aria-label={label}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:overflow-hidden"
    >
      <BoardStage>
        {/* The board's real width, so nothing shifts when it lands: a
            placeholder narrower than what replaces it makes the page jump
            at the moment a person is deciding whether it works. */}
        <section className="flex min-w-0 flex-col items-center justify-center gap-2">
          <Skeleton className={cn("h-4", BOARD_STAGE_WIDTH)} />
          <Skeleton className={cn("aspect-square rounded-lg", BOARD_STAGE_WIDTH)} />
          <Skeleton className={cn("h-4", BOARD_STAGE_WIDTH)} />
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="shrink-0 border-b p-3">
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
          <div className="shrink-0 border-b p-3">
            <div className="mx-auto flex w-fit gap-2 rounded-lg bg-muted p-[3px]">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="flex flex-col gap-3 pt-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
          <div className="min-h-0 flex-1 p-3">
            <div className="grid grid-cols-[2.25rem_1fr_1fr] gap-2">
              {SCORESHEET_SKELETON_CELLS.map((cell) => (
                <Skeleton key={cell} className="h-5 w-full" />
              ))}
            </div>
          </div>
          <div className="shrink-0 border-t p-3">
            <Skeleton className="h-5 w-3/4" />
          </div>
          <div className="flex shrink-0 gap-2 border-t p-3">
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 flex-1" />
          </div>
        </aside>
      </BoardStage>
    </output>
  );
}
