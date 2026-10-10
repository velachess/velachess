import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type * as React from "react";

import { BookOpenIcon, WandSparklesIcon } from "@velachess/ui/icons";

/** Claims before asking for a username, so the reason comes first. The last "step" (import) is a form in the dialog, not a slide here. */
export interface OnboardingStep {
  id: string;
  title: MessageDescriptor;
  description: MessageDescriptor;
  icon: React.ComponentType<{ className?: string }>;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "archive",
    title: msg`Your games are the syllabus`,
    description: msg`VelaChess reads your public archive from Chess.com or Lichess. Nothing to install, and no password — the archive is already public.`,
    icon: BookOpenIcon,
  },
  {
    id: "review",
    title: msg`Review every game with Stockfish`,
    description: msg`Pick a game and the engine grades each move. The results are saved, so the next visit opens straight on the board.`,
    icon: WandSparklesIcon,
  },
];

export function StepMedia({ icon: Icon }: { icon: OnboardingStep["icon"] }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg bg-muted">
      <Icon className="size-12 text-brand" />
    </div>
  );
}
