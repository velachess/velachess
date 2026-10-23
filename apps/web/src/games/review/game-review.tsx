import { useState } from "react";

import { useLingui } from "@lingui/react";
import { useParams } from "@tanstack/react-router";
import { useHotkeys } from "react-hotkeys-hook";

import { BoardScreen } from "../../app-shell/board-screen.tsx";
import { useQuery } from "../../libs/react-query.ts";
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

export function GameReview() {
  const { gameId = "" } = useParams({ strict: false });
  const game = useQuery(gameQuery(gameId));

  if (game.isPending) return <AnalysisSkeleton />;
  if (game.isError || !game.data) return <GameError />;

  // The key is load-bearing: it is what resets the review's state for
  // another game, with no effect watching `gameId`.
  return <ReviewScreen key={gameId} game={game.data} />;
}

function ReviewScreen({ game }: { game: ReplayableGame }) {
  const { i18n } = useLingui();

  const [store] = useState(() =>
    createReviewStore({ game, onNavigate: createReplayNavigation(game) }),
  );

  useHotkeys("left", () => store.getState().previous(), { preventDefault: true }, [
    store,
  ]);
  useHotkeys("right", () => store.getState().next(), { preventDefault: true }, [store]);

  // The array itself: a selector building a new one every render never
  // compares equal, and zustand re-renders until React gives up.
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
          game={game}
          orientation={players.orientation}
          top={players.top}
          bottom={players.bottom}
        />

        <AnalysisPanel game={game} />
      </BoardScreen>
    </ReviewStoreProvider>
  );
}
