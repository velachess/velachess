import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { EvalBar } from "@velachess/ui/chess/eval-bar";

import { useQuery } from "../../libs/react-query.ts";
import { boardGradesAtPly, gameAnalysisQuery } from "./game-analysis-query.ts";
import type { ReplayableGame } from "./game-record.ts";
import { evaluationOf } from "./move-presentation.ts";
import { variationFen } from "./review-model.ts";
import { useGameReview } from "./use-game-review.ts";
import { useVariationEvaluation } from "./use-variation-evaluation.ts";

const BAR_COPY = {
  evaluation: msg`Evaluation`,
} as const;

export interface BoardEvaluationProps {
  game: ReplayableGame;
  orientation: "white" | "black";
}

/**
 * The bar beside the board, and the owner of the engine session behind a
 * variation's number.
 *
 * Its own component because it is the only thing that reads an
 * interactive evaluation: a line being explored produces an answer every
 * few hundred milliseconds, and reading that where the board reads its
 * grades would redraw 64 squares for a number drawn beside them.
 *
 * A variation's own evaluation wins over the report's for the same ply —
 * the board is showing that line, not the game.
 */
export function BoardEvaluation({ game, orientation }: BoardEvaluationProps) {
  const { i18n } = useLingui();

  const ply = useGameReview((state) => state.ply);
  const fen = useGameReview((state) => variationFen(state.variation));
  const variationScore = useVariationEvaluation(fen);
  const grades = useQuery({
    ...gameAnalysisQuery(game),
    select: boardGradesAtPly(ply),
  });

  const evaluation = evaluationOf(variationScore ?? grades.data?.played?.evalAfter);

  return (
    <EvalBar
      whiteShare={evaluation.whiteShare}
      label={evaluation.label}
      description={i18n._(BAR_COPY.evaluation)}
      orientation={orientation}
    />
  );
}
