import { useState } from "react";

import { useLingui } from "@lingui/react";
import { useParams } from "@tanstack/react-router";
import { useHotkeys } from "react-hotkeys-hook";

import { BoardScreen } from "../../app-shell/board-screen.tsx";
import { useQuery } from "../../libs/react-query.ts";
import { useEngineAnalysis } from "../analysis/index.ts";
import { useMyAccounts } from "../import/index.ts";
import { AnalysisPanel } from "./analysis-panel.tsx";
import { BoardPane } from "./board-pane.tsx";
import { gameQuery, type ReplayableGame } from "./game-record.ts";
import { GameCrumb } from "./game-crumb.tsx";
import { reviewPlayersOf, usernamesOf } from "./review-presentation.ts";
import { createReplayNavigation } from "./review-navigation.ts";
import { AnalysisSkeleton, GameError } from "./review-skeleton.tsx";
import { createReviewStore } from "./review-store.ts";
import { ReviewStoreProvider } from "./use-game-review.ts";
import { useVariationEvaluation } from "./use-variation-evaluation.ts";

/**
 * The game itself comes over HTTP through React Query; the analysis does
 * not, because it is computed on this device and its progress belongs
 * here rather than to a cache of server state. The route is what starts
 * it — see `game-review-route.ts`.
 */
export function GameReview() {
  // strict: false so it mounts under both the generated route tree and
  // the hand-built one in tests.
  const { gameId = "" } = useParams({ strict: false });
  const game = useQuery(gameQuery(gameId));

  if (game.isPending) return <AnalysisSkeleton />;
  if (game.isError || !game.data) return <GameError />;

  // The key is load-bearing: the review's state belongs to *this* game,
  // and remounting resets it without an effect watching `gameId`.
  return <ReviewScreen key={gameId} gameId={gameId} game={game.data} />;
}

function ReviewScreen({ gameId, game }: { gameId: string; game: ReplayableGame }) {
  const { i18n } = useLingui();

  // One store per review, built once: `key={gameId}` above is what
  // replaces it, so nothing here watches the game for changes.
  const [store] = useState(() =>
    createReviewStore({ game, onNavigate: createReplayNavigation(game) }),
  );

  useVariationEvaluation(store);

  // Ignored while a form field has focus (react-hotkeys-hook default) —
  // an arrow key stepping the board while someone types elsewhere would
  // be the wrong kind of clever.
  useHotkeys("left", () => store.getState().previous(), { preventDefault: true }, [
    store,
  ]);
  useHotkeys("right", () => store.getState().next(), { preventDefault: true }, [store]);

  const analysis = useEngineAnalysis(gameId);
  // The array itself, mapped where it is used: a selector that builds a
  // new array every render never compares equal, and zustand re-renders
  // until React gives up.
  const accounts = useMyAccounts((state) => state.accounts);

  const players = reviewPlayersOf(game, usernamesOf(accounts), (rating) =>
    i18n.number(rating),
  );

  return (
    <ReviewStoreProvider value={store}>
      <BoardScreen
        page={
          <GameCrumb
            game={game}
            white={game.whiteName}
            black={game.blackName}
            mySeat={players.mySeat}
          />
        }
      >
        <BoardPane
          graded={analysis.graded}
          orientation={players.orientation}
          top={players.top}
          bottom={players.bottom}
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
