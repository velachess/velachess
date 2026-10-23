import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { EvalBar } from "@velachess/ui/chess/eval-bar";

import type { WhitePovScore } from "../analysis/index.ts";

import { useQuery } from "../../libs/react-query.ts";
import { boardGradesAtPly, gameAnalysisQuery } from "./game-analysis-query.ts";
import type { ReplayableGame } from "./game-record.ts";
import { evaluationOf, UNKNOWN_EVALUATION } from "./move-presentation.ts";
import { variationFen } from "./review-model.ts";
import { useGameReview } from "./use-game-review.ts";
import { useVariationEvaluation } from "./use-variation-evaluation.ts";

const BAR_COPY = {
  evaluation: msg`Evaluation`,
} as const;

/**
 * One position, one number: the report answers for the game's own moves and
 * the engine for a line someone is trying out. A line waiting on its search
 * — or whose search failed, was cancelled or was superseded — has no number,
 * and the game's is about a position nobody is looking at.
 */
function barReading(
  fen: string | null,
  variationScore: WhitePovScore | null,
  playedEvalAfter: WhitePovScore | undefined,
) {
  if (fen === null) return evaluationOf(playedEvalAfter);
  if (variationScore) return evaluationOf(variationScore);
  return UNKNOWN_EVALUATION;
}

export interface BoardEvaluationProps {
  game: ReplayableGame;
  orientation: "white" | "black";
}

/**
 * The bar beside the board. Its own component because a line being
 * explored answers every few hundred milliseconds, and reading that
 * where the board reads its grades would redraw 64 squares for a number
 * drawn beside them.
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

  const evaluation = barReading(fen, variationScore, grades.data?.played?.evalAfter);

  return (
    <EvalBar
      whiteShare={evaluation.whiteShare}
      label={evaluation.label}
      description={i18n._(BAR_COPY.evaluation)}
      orientation={orientation}
    />
  );
}
