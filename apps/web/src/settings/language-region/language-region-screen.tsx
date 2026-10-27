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
import {
  isLocale,
  LOCALE_OPTIONS,
  resolveLocale,
  type Locale,
} from "../../i18n/locale.ts";
import { useLocaleStore } from "../../i18n/locale-store.ts";
import { SettingsSection } from "../layout/settings-section.tsx";

const LANGUAGE_COPY = {
  title: msg`Language`,
  description: msg`Locale preferences for this device.`,
  language: msg`Language`,
  languageHint: msg`System default follows your browser's language.`,
  system: msg`System default`,
} as const;

const SYSTEM_VALUE = "system" as const;

/** `null` in the locale store means "System default". */
export function LanguageRegionScreen() {
  const { i18n } = useLingui();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  const items = [
    { value: SYSTEM_VALUE, label: i18n._(LANGUAGE_COPY.system) },
    ...LOCALE_OPTIONS.map((option) => ({ value: option.locale, label: option.label })),
  ];

  const applyLocale = (next: Locale | null) => {
    setLocale(next);
    void activateLocale(resolveLocale(next, navigator.languages));
  };

  const handleLocaleChange = (value: unknown) => {
    if (value === SYSTEM_VALUE) {
      applyLocale(null);
      return;
    }
    if (typeof value === "string" && isLocale(value)) applyLocale(value);
  };

  return (
    <SettingsSection
      title={i18n._(LANGUAGE_COPY.title)}
      description={i18n._(LANGUAGE_COPY.description)}
    >
      <Field>
        <FieldLabel htmlFor="locale">{i18n._(LANGUAGE_COPY.language)}</FieldLabel>
        <Select
          items={items}
          value={locale ?? SYSTEM_VALUE}
          onValueChange={handleLocaleChange}
        >
          <SelectTrigger id="locale" className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{i18n._(LANGUAGE_COPY.languageHint)}</FieldDescription>
      </Field>
    </SettingsSection>
  );
}
