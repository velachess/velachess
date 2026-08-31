import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Field, FieldDescription } from "@velachess/ui/components/field";

import { SoundToggle } from "../../chess-sounds/index.ts";

const GAMEPLAY_COPY = {
  title: msg`Gameplay`,
  description: msg`Board interaction preferences.`,
  soundHint: msg`Plays a sound for moves, captures, checks, and castling while reviewing or drilling.`,
} as const;

/** Settings → Gameplay: board preferences. Sound is the first — its
 * on/off lives here only, not duplicated anywhere else in the app. */
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

      <Field>
        <SoundToggle />
        <FieldDescription>{i18n._(GAMEPLAY_COPY.soundHint)}</FieldDescription>
      </Field>
    </div>
  );
}
