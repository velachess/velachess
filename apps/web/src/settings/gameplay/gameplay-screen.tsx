import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId } from "react";

import { FieldLegend, FieldSet } from "@velachess/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@velachess/ui/components/item";
import { Switch } from "@velachess/ui/components/switch";
import { Volume2Icon } from "@velachess/ui/icons";

import { useSoundPreferences } from "../../chess-sounds/index.ts";
import { SettingsSection } from "../layout/settings-section.tsx";

const GAMEPLAY_COPY = {
  title: msg`Gameplay`,
  description: msg`Board interaction preferences.`,
  sounds: msg`Sounds`,
  moveSounds: msg`Move sounds`,
  moveSoundsHint: msg`Plays a sound for moves, captures, checks, and castling while reviewing a game.`,
} as const;

export function GameplayScreen() {
  const { i18n } = useLingui();
  const moveSoundsId = useId();
  const moveSoundsHintId = useId();
  const muted = useSoundPreferences((state) => state.muted);
  const setMuted = useSoundPreferences((state) => state.setMuted);

  return (
    <SettingsSection
      title={i18n._(GAMEPLAY_COPY.title)}
      description={i18n._(GAMEPLAY_COPY.description)}
    >
      <FieldSet className="gap-3">
        <FieldLegend variant="label">{i18n._(GAMEPLAY_COPY.sounds)}</FieldLegend>
        <Item variant="outline" className="px-4 py-3">
          <ItemMedia className="size-9 rounded-md bg-muted">
            <Volume2Icon className="size-4" />
          </ItemMedia>
          <ItemContent className="gap-0.5">
            <ItemTitle id={moveSoundsId}>{i18n._(GAMEPLAY_COPY.moveSounds)}</ItemTitle>
            <ItemDescription id={moveSoundsHintId} className="line-clamp-none">
              {i18n._(GAMEPLAY_COPY.moveSoundsHint)}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch
              aria-labelledby={moveSoundsId}
              aria-describedby={moveSoundsHintId}
              checked={!muted}
              onCheckedChange={(checked) => setMuted(!checked)}
            />
          </ItemActions>
        </Item>
      </FieldSet>
    </SettingsSection>
  );
}
