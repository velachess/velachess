import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import type { ReplayableGame } from "../analysis-contract.ts";

const RESULT_COPY = {
  white: msg`White`,
  black: msg`Black`,
  victory: msg`Victory`,
  draw: msg`Draw`,
  unfinished: msg`Unfinished`,
} as const;

const PGN_RESULT = {
  draw: "1/2-1/2",
  unfinished: "*",
  whiteWin: "1-0",
} as const;

function outcomeCopy(result: ReplayableGame["result"]): MessageDescriptor[] {
  if (result === PGN_RESULT.draw) return [RESULT_COPY.draw];
  if (result === PGN_RESULT.unfinished) return [RESULT_COPY.unfinished];

  const winner = result === PGN_RESULT.whiteWin ? RESULT_COPY.white : RESULT_COPY.black;
  return [winner, RESULT_COPY.victory];
}

export interface GameResultProps {
  result: ReplayableGame["result"];
  /** The platform's own words for how it ended, when it gave any. */
  termination: string | null;
}

export function GameResult({ result, termination }: GameResultProps) {
  const { i18n } = useLingui();

  const outcome = outcomeCopy(result).map((message) => i18n._(message));

  return (
    <section className="flex shrink-0 flex-col items-center gap-1.5 border-t bg-muted/20 px-3 py-4 text-center">
      <span className="rounded-full border bg-background px-4 py-1 font-mono text-base font-bold tracking-wide tabular-nums">
        {result}
      </span>
      <span className="text-xs font-medium tracking-wide text-muted-foreground">
        {/* The platform's raw sentence — translating it would invent a fact. */}
        {[...outcome, termination].filter(Boolean).join(" · ")}
      </span>
    </section>
  );
}
