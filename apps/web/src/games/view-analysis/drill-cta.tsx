import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link } from "@tanstack/react-router";

import type { DrillCount } from "../analysis-contract.ts";

/**
 * Three CTA states: zero-after-triage is a clean game, zero-before-triage
 * means "not analyzed yet" — collapsing them would misreport the game.
 */
const CTA_COPY = {
  title: msg`Drill your mistakes`,
  waiting: msg`Working out which positions are worth drilling…`,
  patterns: msg`See your patterns`,
} as const;

export interface DrillCtaProps {
  drills: DrillCount | undefined;
}

export function DrillCta({ drills }: DrillCtaProps) {
  const { i18n } = useLingui();

  // Absent means an API that has not been redeployed, not a clean game.
  // Rendering nothing is the only honest answer.
  if (!drills) return null;

  if (!drills.triaged) {
    return <p className="text-muted-foreground text-sm">{i18n._(CTA_COPY.waiting)}</p>;
  }

  if (drills.eligible === 0) return <InsightsLink />;

  return (
    <div className="flex flex-col gap-3">
      <Link
        to="/drill"
        className="border-input hover:bg-accent flex flex-col rounded-xl border p-4"
      >
        <span className="font-medium">{i18n._(CTA_COPY.title)}</span>
        <span className="text-muted-foreground text-sm">
          {drillCountLabel(drills.eligible, i18n.number(drills.eligible))}
        </span>
      </Link>
      <InsightsLink />
    </div>
  );
}

/** Says "yours" explicitly — the table above shows both sides, and summing the columns gives a bigger number than this button's. */
function drillCountLabel(eligible: number, formatted: string): string {
  return eligible === 1
    ? `Review 1 position of yours and find the better move`
    : `Review ${formatted} positions of yours and find the better move`;
}

function InsightsLink() {
  const { i18n } = useLingui();
  return (
    <Link to="/insights" className="text-muted-foreground text-sm underline">
      {i18n._(CTA_COPY.patterns)}
    </Link>
  );
}
