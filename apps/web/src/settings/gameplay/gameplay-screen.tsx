import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Field, FieldDescription } from "@velachess/ui/components/field";

import { SoundToggle } from "../../chess-sounds/index.ts";
import { SettingsSection } from "../layout/settings-section.tsx";

const GAMEPLAY_COPY = {
  title: msg`Gameplay`,
  description: msg`Board interaction preferences.`,
  soundHint: msg`Plays a sound for moves, captures, checks, and castling while reviewing a game.`,
} as const;

/** Settings → Gameplay: board preferences. Sound is the first — its
 * on/off lives here only, not duplicated anywhere else in the app. */
export function GameplayScreen() {
  const { i18n } = useLingui();

  return (
    <SettingsSection
      title={i18n._(GAMEPLAY_COPY.title)}
      description={i18n._(GAMEPLAY_COPY.description)}
    >
      <Field>
        <SoundToggle />
        <FieldDescription>{i18n._(GAMEPLAY_COPY.soundHint)}</FieldDescription>
      </Field>
    </SettingsSection>
  );
}
