import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Alert, AlertDescription, AlertTitle } from "@velachess/ui/components/alert";
import { Progress } from "@velachess/ui/components/progress";
import { Spinner } from "@velachess/ui/components/spinner";

import { progressPercent } from "../analysis-read.ts";

const STATUS_COPY = {
  preparing: msg`Preparing analysis…`,
  loadError: msg`Couldn't load analysis.`,
  rateLimited: msg`Too many analyses at once.`,
} as const;

const analyzingLabel = (graded: number, total: number) =>
  msg`Analyzing move ${graded} of ${total}…`;

const rateLimitedRetry = msg`{seconds, plural, one {Try again in # second.} other {Try again in # seconds.}}`;

export interface AnalysisStatusProps {
  graded: number;
  totalPlies: number;
  isAnalyzing: boolean;
  hasFailed: boolean;
  /** Set when the failure is the rate limit — a wait, not a defect. */
  retryAfterSeconds?: number | null;
}

export function AnalysisStatus({
  graded,
  totalPlies,
  isAnalyzing,
  hasFailed,
  retryAfterSeconds = null,
}: AnalysisStatusProps) {
  const { i18n } = useLingui();

  if (!isAnalyzing && !hasFailed) return null;

  if (hasFailed) {
    // A throttled run is not a broken one, and telling someone their
    // analysis "couldn't load" when it was refused on purpose teaches
    // exactly the wrong reaction — mash the button again. `info`, with
    // the wait, because there is nothing to fix and a time to come back.
    if (retryAfterSeconds !== null) {
      return (
        <div className="shrink-0 border-b p-3">
          <Alert>
            <AlertTitle>{i18n._(STATUS_COPY.rateLimited)}</AlertTitle>
            <AlertDescription>
              {i18n._({
                ...rateLimitedRetry,
                // Raw, not i18n.number()'d: the plural rule itself picks
                // the category from the number, and `#` formats it.
                values: { seconds: retryAfterSeconds },
              })}
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return (
      <div className="shrink-0 border-b p-3">
        <Alert variant="destructive">
          <AlertTitle>{i18n._(STATUS_COPY.loadError)}</AlertTitle>
        </Alert>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b p-3">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          {/* Deterministic, and it moves: "analyzing" alone cannot be
              told apart from "stuck". `shimmer` is shadcn's utility and
              stops itself under prefers-reduced-motion. */}
          <span className="shimmer">
            <AnalysisLabel graded={graded} totalPlies={totalPlies} />
          </span>
        </span>
        <Progress value={progressPercent(graded, totalPlies)} />
      </div>
    </div>
  );
}

function AnalysisLabel({ graded, totalPlies }: { graded: number; totalPlies: number }) {
  const { i18n } = useLingui();

  if (graded === 0) return i18n._(STATUS_COPY.preparing);
  return i18n._(analyzingLabel(graded, totalPlies));
}
