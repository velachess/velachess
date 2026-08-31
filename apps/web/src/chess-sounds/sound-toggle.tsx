import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Toggle } from "@velachess/ui/components/toggle";
import { Volume2Icon, VolumeXIcon } from "@velachess/ui/icons";

import { useSoundPreferences } from "./chess-sounds.ts";

const SOUND_COPY = {
  label: msg`Move sounds`,
  mute: msg`Mute move sounds`,
  unmute: msg`Turn move sounds on`,
} as const;

export function SoundToggle() {
  const { i18n } = useLingui();
  const muted = useSoundPreferences((state) => state.muted);
  const setMuted = useSoundPreferences((state) => state.setMuted);

  return (
    <Toggle
      variant="outline"
      className="w-full justify-start"
      pressed={!muted}
      onPressedChange={(pressed) => setMuted(!pressed)}
      aria-label={i18n._(muted ? SOUND_COPY.unmute : SOUND_COPY.mute)}
    >
      {muted && <VolumeXIcon />}
      {!muted && <Volume2Icon />}
      {i18n._(SOUND_COPY.label)}
    </Toggle>
  );
}
