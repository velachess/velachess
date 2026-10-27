import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId } from "react";

import { FieldDescription, FieldLegend, FieldSet } from "@velachess/ui/components/field";
import { Label } from "@velachess/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@velachess/ui/components/radio-group";
import { useTheme } from "@velachess/ui/lib/theme-provider";
import type { ResolvedTheme, Theme } from "@velachess/ui/lib/theme";
import { cn } from "@velachess/ui/lib/utils";

import { SettingsSection } from "../layout/settings-section.tsx";

const APPEARANCE_COPY = {
  title: msg`Appearance`,
  description: msg`How VelaChess looks on this device.`,
  theme: msg`Application theme`,
  themeHint: msg`System follows your operating system's setting.`,
} as const;

const THEME_OPTIONS = [
  { value: "system", label: msg`System` },
  { value: "light", label: msg`Light` },
  { value: "dark", label: msg`Dark` },
] as const satisfies readonly { value: Theme; label: MessageDescriptor }[];

/** Settings → Appearance: the same theme provider the account dropdown's
 * quick toggle reads — one piece of state, two entry points. */
export function AppearanceScreen() {
  const { i18n } = useLingui();
  const { theme, setTheme } = useTheme();
  const legendId = useId();

  return (
    <SettingsSection
      title={i18n._(APPEARANCE_COPY.title)}
      description={i18n._(APPEARANCE_COPY.description)}
    >
      <FieldSet>
        <FieldLegend id={legendId} variant="label">
          {i18n._(APPEARANCE_COPY.theme)}
        </FieldLegend>
        <FieldDescription>{i18n._(APPEARANCE_COPY.themeHint)}</FieldDescription>
        <RadioGroup<Theme>
          aria-labelledby={legendId}
          value={theme}
          onValueChange={setTheme}
          className="grid max-w-lg grid-cols-3 gap-3 sm:gap-4"
        >
          {THEME_OPTIONS.map((option) => (
            <Label
              key={option.value}
              className="group/theme min-w-0 cursor-pointer flex-col items-stretch gap-2 font-normal"
            >
              <RadioGroupItem value={option.value} className="sr-only" />
              <div className="aspect-4/3 overflow-hidden rounded-lg border-2 border-border transition-colors group-hover/theme:border-border-strong group-has-focus-visible/theme:ring-3 group-has-focus-visible/theme:ring-ring/50 group-has-data-checked/theme:border-primary">
                <ThemePreview theme={option.value} />
              </div>
              <span className="text-center text-muted-foreground group-has-data-checked/theme:font-medium group-has-data-checked/theme:text-foreground">
                {i18n._(option.label)}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </FieldSet>
    </SettingsSection>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  if (theme === "system") {
    return (
      <div className="grid h-full grid-cols-2">
        <PreviewCanvas palette="light" />
        <PreviewCanvas palette="dark" />
      </div>
    );
  }
  return <PreviewCanvas palette={theme} />;
}

/** The palette class re-scopes every token beneath it, so the preview is
 * drawn with the real theme rather than a copy of its colors. */
function PreviewCanvas({ palette }: { palette: ResolvedTheme }) {
  return (
    <div aria-hidden className={cn(palette, "flex h-full gap-1.5 bg-background p-2")}>
      <div className="flex w-1/4 flex-col gap-1 rounded-sm bg-card p-1">
        <div className="h-1 rounded-full bg-primary" />
        <div className="h-1 rounded-full bg-muted-foreground/40" />
        <div className="h-1 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="h-1.5 w-1/2 rounded-full bg-foreground/80" />
        <div className="h-1 w-3/4 rounded-full bg-muted-foreground/40" />
        <div className="flex-1 rounded-sm border bg-card" />
      </div>
    </div>
  );
}
