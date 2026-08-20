import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type * as React from "react";

import { BookOpenIcon, TargetIcon, WandSparklesIcon } from "@velachess/ui/icons";

/** Three claims before asking for a username, so the reason comes first. The 4th "step" (import) is a form in the dialog, not a slide here. */
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
    id: "repertoire",
    title: msg`Your book, from your own play`,
    description: msg`It builds your opening repertoire out of what you actually play, then marks the moves where you left it.`,
    icon: TargetIcon,
  },
  {
    id: "drills",
    title: msg`Drills from the mistakes that cost you`,
    description: msg`Stockfish confirms what leaving your book was worth. The ones that hurt come back as spaced-repetition drills.`,
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
