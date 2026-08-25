import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Field, FieldDescription, FieldLabel } from "@velachess/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@velachess/ui/components/select";

import { activateLocale } from "../../i18n/index.ts";
import { LOCALE_OPTIONS, resolveLocale, type Locale } from "../../i18n/locale.ts";
import { useLocaleStore } from "../../i18n/locale-store.ts";

const LANGUAGE_COPY = {
  title: msg`Language & region`,
  description: msg`Locale preferences for this device.`,
  language: msg`Language`,
  languageHint: msg`System default follows your browser's language.`,
  system: msg`System default`,
} as const;

const SYSTEM_VALUE = "system" as const;

/** Settings → Language & region: reads and writes the one locale
 * preference — `null` in the store means "System default". */
export function LanguageRegionScreen() {
  const { i18n } = useLingui();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">{i18n._(LANGUAGE_COPY.title)}</h2>
        <p className="text-sm text-muted-foreground">
          {i18n._(LANGUAGE_COPY.description)}
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor="locale">{i18n._(LANGUAGE_COPY.language)}</FieldLabel>
        <Select
          value={locale ?? SYSTEM_VALUE}
          onValueChange={(value) => {
            const next = value === SYSTEM_VALUE ? null : (value as Locale);
            setLocale(next);
            void activateLocale(resolveLocale(next, navigator.languages));
          }}
        >
          <SelectTrigger id="locale" className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SYSTEM_VALUE}>{i18n._(LANGUAGE_COPY.system)}</SelectItem>
            {LOCALE_OPTIONS.map((option) => (
              <SelectItem key={option.locale} value={option.locale}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{i18n._(LANGUAGE_COPY.languageHint)}</FieldDescription>
      </Field>
    </div>
  );
}
