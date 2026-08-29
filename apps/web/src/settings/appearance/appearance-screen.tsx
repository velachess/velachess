import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Field, FieldDescription, FieldLabel } from "@velachess/ui/components/field";
import { ToggleGroup, ToggleGroupItem } from "@velachess/ui/components/toggle-group";
import { Monitor, Moon, Sun } from "@velachess/ui/icons";
import { useTheme } from "@velachess/ui/lib/theme-provider";
import type { Theme } from "@velachess/ui/lib/theme";

const APPEARANCE_COPY = {
  title: msg`Appearance`,
  description: msg`How VelaChess looks on this device.`,
  theme: msg`Application theme`,
  themeHint: msg`System follows your operating system's setting.`,
  system: msg`System`,
  light: msg`Light`,
  dark: msg`Dark`,
} as const;

/** Settings → Appearance: the same theme provider the account dropdown's
 * quick toggle reads — one piece of state, two entry points. */
export function AppearanceScreen() {
  const { i18n } = useLingui();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">{i18n._(APPEARANCE_COPY.title)}</h2>
        <p className="text-sm text-muted-foreground">
          {i18n._(APPEARANCE_COPY.description)}
        </p>
      </div>

      <Field>
        <FieldLabel>{i18n._(APPEARANCE_COPY.theme)}</FieldLabel>
        <ToggleGroup
          variant="outline"
          value={[theme]}
          onValueChange={(value) => {
            const next = value[0] as Theme | undefined;
            if (next) setTheme(next);
          }}
        >
          <ToggleGroupItem value="system" aria-label={i18n._(APPEARANCE_COPY.system)}>
            <Monitor className="size-4" />
            {i18n._(APPEARANCE_COPY.system)}
          </ToggleGroupItem>
          <ToggleGroupItem value="light" aria-label={i18n._(APPEARANCE_COPY.light)}>
            <Sun className="size-4" />
            {i18n._(APPEARANCE_COPY.light)}
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label={i18n._(APPEARANCE_COPY.dark)}>
            <Moon className="size-4" />
            {i18n._(APPEARANCE_COPY.dark)}
          </ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>{i18n._(APPEARANCE_COPY.themeHint)}</FieldDescription>
      </Field>
    </div>
  );
}
