import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { resolveGamePerspective } from "@velachess/chess";
import { BOARD_STAGE_WIDTH, BoardStage } from "@velachess/ui/chess/board-stage";
import { Empty, EmptyDescription, EmptyHeader } from "@velachess/ui/components/empty";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { cn } from "@velachess/ui/lib/utils";

import { BoardScreen } from "../../app-shell/board-screen.tsx";
import { CHESS_SOUND_EVENT, playChessSound } from "../../chess-sounds/index.ts";
import { useQuery } from "../../libs/react-query.ts";
import { ANALYSIS_DEPTH, startAnalysis, useEngineAnalysis } from "../analysis/index.ts";
import { flairImageOf, useMyAccounts } from "../import/index.ts";
import { AnalysisPanel } from "./analysis-panel.tsx";
import { seatIdentityOf, seatOf } from "./board-view.ts";
import { BoardPane } from "./board-pane.tsx";
import { gameQuery, type ReplayableGame } from "./game-record.ts";
import { GameCrumb } from "./game-crumb.tsx";
import {
  REPLAY_NAVIGATION,
  ReviewStoreProvider,
  useCreateReviewStore,
  type ReplayNavigation,
} from "./use-game-review.ts";
import { useVariationEvaluation } from "./use-variation-evaluation.ts";

const ANALYSE_COPY = {
  loading: msg`Loading the game…`,
  loadError: msg`Couldn't load analysis.`,
} as const;

const SCORESHEET_SKELETON_CELLS = Array.from(
  { length: 24 },
  (_, index) => `scoresheet-cell-${index}`,
);

/**
 * The game itself still comes over HTTP through React Query; the analysis
 * does not, because it is computed here and its progress belongs to the
 * device rather than to a cache of server state.
 */
export function GameReview() {
  const { i18n } = useLingui();
  // strict: false so it mounts under both the generated route tree and
  // the hand-built one in tests.
  const { gameId = "" } = useParams({ strict: false });
  const game = useQuery(gameQuery(gameId));
  const rawPgn = game.data?.rawPgn;

  // Whether an analysis is running is not something a render can derive,
  // and it has to outlive this screen — so this is the one effect here,
  // and deliberately without cleanup: leaving the screen is not a reason
  // to throw away the grading already paid for.
  useEffect(() => {
    if (rawPgn === undefined) return;
    startAnalysis({ gameId, rawPgn, depth: ANALYSIS_DEPTH });
  }, [gameId, rawPgn]);

  if (game.isPending) {
    return <AnalysisSkeleton label={i18n._(ANALYSE_COPY.loading)} />;
  }

  if (game.isError || !game.data) {
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

  // The key is load-bearing: the review's state belongs to *this* game,
  // and remounting resets it without an effect watching `gameId`.
  return <ReviewScreen key={gameId} gameId={gameId} game={game.data} />;
}

function ReviewScreen({ gameId, game }: { gameId: string; game: ReplayableGame }) {
  const { i18n } = useLingui();
  const analysis = useEngineAnalysis(gameId);
  // The array itself, mapped where it is used: a selector that builds a
  // new array every render never compares equal, and zustand re-renders
  // until React gives up.
  const myAccounts = useMyAccounts((state) => state.accounts);

  const myUsernames = usernamesOf(myAccounts);
  const orientation = seatOf(game, myUsernames);

  // Stepping the game is what makes a sound; playing a variation is not.
  // The store keeps the first of these it is given, so the seat is read
  // when a sound plays rather than captured — tracked accounts can land
  // after the screen has mounted.
  const announce: ReplayNavigation = (event) => {
    if (event.type === REPLAY_NAVIGATION.START) {
      playChessSound({ type: CHESS_SOUND_EVENT.GAME_START });
      return;
    }
    playChessSound({
      type: CHESS_SOUND_EVENT.MOVE,
      fenBefore: event.move.fenBefore,
      san: event.move.san,
      viewerColor: seatOf(game, usernamesOf(useMyAccounts.getState().accounts)),
    });
  };

  const store = useCreateReviewStore(game, announce);

  useVariationEvaluation(store);

  // Arrow keys step the board. Ignored while a form field has focus
  // (react-hotkeys-hook default) — an arrow key stepping the board while
  // someone types elsewhere would be the wrong kind of clever.
  useHotkeys("left", () => store.getState().previous(), { preventDefault: true }, [
    store,
  ]);
  useHotkeys("right", () => store.getState().next(), { preventDefault: true }, [store]);

  // Identity rides with the game detail payload for BOTH seats — the
  // server resolves each handle from a shared profile cache, tracked
  // account or not.
  const seat = (name: string, rating: number | null, side: "white" | "black") => {
    const identity = seatIdentityOf(
      side === "white" ? game.whiteIdentity : game.blackIdentity,
    );
    return {
      name,
      rating: rating === null ? undefined : i18n.number(rating),
      avatarUrl: identity.avatarUrl,
      // The API carries the flair id; the address it is served from is
      // presentation, resolved at the last moment before render.
      flair: identity.flair ? flairImageOf(identity.flair) : undefined,
    };
  };
  const white = seat(game.whiteName, game.whiteRating, "white");
  const black = seat(game.blackName, game.blackRating, "black");

  // "You" is a claim, so it needs evidence. The board falls back to white
  // when nobody knows which seat is yours; the trail does not.
  const mySeat = resolveGamePerspective(game, myUsernames);
  const top = orientation === "white" ? black : white;
  const bottom = orientation === "white" ? white : black;

  return (
    <ReviewStoreProvider value={store}>
      <BoardScreen
        page={
          <GameCrumb game={game} white={white.name} black={black.name} mySeat={mySeat} />
        }
      >
        <BoardPane
          graded={analysis.graded}
          orientation={orientation}
          top={top}
          bottom={bottom}
        />

        <AnalysisPanel
          game={game}
          graded={analysis.graded}
          isAnalyzing={analysis.status === "analyzing"}
          hasFailed={analysis.status === "error"}
        />
      </BoardScreen>
    </ReviewStoreProvider>
  );
}

const usernamesOf = (accounts: readonly { username: string }[]) =>
  accounts.map((account) => account.username);

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
