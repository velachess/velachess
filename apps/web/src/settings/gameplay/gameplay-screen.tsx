import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@velachess/ui/components/empty";

const GAMEPLAY_COPY = {
  title: msg`Gameplay`,
  description: msg`Board interaction preferences.`,
  emptyTitle: msg`Nothing to configure yet`,
  emptyDescription: msg`Board preferences like coordinates, move animation, and sound will land here once they exist.`,
} as const;

/** Settings → Gameplay: the section exists so the information architecture
 * is complete, but no board preference has a real implementation yet — an
 * honest empty state, not invented controls. */
export function GameplayScreen() {
  const { i18n } = useLingui();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">{i18n._(GAMEPLAY_COPY.title)}</h2>
        <p className="text-sm text-muted-foreground">
          {i18n._(GAMEPLAY_COPY.description)}
        </p>
      </div>

      <Empty>
        <EmptyHeader>
          <EmptyTitle>{i18n._(GAMEPLAY_COPY.emptyTitle)}</EmptyTitle>
          <EmptyDescription>{i18n._(GAMEPLAY_COPY.emptyDescription)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
