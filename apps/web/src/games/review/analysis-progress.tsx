import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Alert, AlertTitle } from "@velachess/ui/components/alert";
import { Progress } from "@velachess/ui/components/progress";
import { Spinner } from "@velachess/ui/components/spinner";

import { useQuery } from "../../libs/react-query.ts";
import { gameAnalysisQuery, selectProgress } from "./game-analysis-query.ts";
import type { ProgressReading } from "./game-analysis-query.ts";
import type { ReplayableGame } from "./game-record.ts";

const STATUS_COPY = {
  preparing: msg`Preparing analysis…`,
  loadError: msg`Couldn't load analysis.`,
} as const;

const analyzingLabel = (graded: number, total: number) =>
  msg`Analyzing move ${graded} of ${total}…`;

const searchingLabel = (ply: number, total: number, depth: number) =>
  msg`Analyzing move ${ply} of ${total} — depth ${depth}…`;

/** Whole percent, floored at 0 and capped at 100. Null when unknowable —
 * the bar then reads as indeterminate rather than as empty. */
function progressPercent(graded: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((graded / total) * 100)));
}

const NOT_STARTED: ProgressReading = { graded: 0, searching: null };

export interface AnalysisProgressProps {
  game: ReplayableGame;
  /** The axis the bar fills against, from the replay rather than the run. */
  totalPlies: number;
}

/**
 * The one consumer of the search in flight. It subscribes on its own so
 * a deepening search redraws this bar and nothing else — the panel
 * around it reads only the grades that have landed.
 */
export function AnalysisProgress({ game, totalPlies }: AnalysisProgressProps) {
  const { i18n } = useLingui();
  const analysis = useQuery({ ...gameAnalysisQuery(game), select: selectProgress });

  if (analysis.isError) {
    return (
      <div className="shrink-0 border-b p-3">
        <Alert variant="destructive">
          <AlertTitle>{i18n._(STATUS_COPY.loadError)}</AlertTitle>
        </Alert>
      </div>
    );
  }

  if (!analysis.isFetching) return null;

  const progress = analysis.data ?? NOT_STARTED;

  return (
    <div className="shrink-0 border-b p-3">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          {/* Deterministic, and it moves: "analyzing" alone cannot be
              told apart from "stuck". `shimmer` is shadcn's utility and
              stops itself under prefers-reduced-motion. */}
          <span className="shimmer">
            <AnalysisLabel progress={progress} totalPlies={totalPlies} />
          </span>
        </span>
        <Progress value={progressPercent(progress.graded, totalPlies)} />
      </div>
    </div>
  );
}

function AnalysisLabel({
  progress,
  totalPlies,
}: {
  progress: ProgressReading;
  totalPlies: number;
}) {
  const { i18n } = useLingui();
  const { graded, searching } = progress;

  if (searching) {
    return i18n._(searchingLabel(searching.ply, totalPlies, searching.depth));
  }
  if (graded === 0) return i18n._(STATUS_COPY.preparing);
  return i18n._(analyzingLabel(graded, totalPlies));
}
