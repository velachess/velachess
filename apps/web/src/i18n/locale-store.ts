import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Locale } from "./locale.ts";

interface LocaleStore {
  /** `null` means "System default" — resolveLocale falls through to the
   * browser's own languages for this, so it isn't a fourth locale value. */
  locale: Locale | null;
  setLocale: (locale: Locale | null) => void;
}

const LOCALE_STORAGE_KEY = "velachess.locale";

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: null,
      setLocale: (locale) => set({ locale }),
    }),
    { name: LOCALE_STORAGE_KEY, version: 1 },
  ),
);
