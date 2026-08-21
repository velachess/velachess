import { setupI18n } from "@lingui/core";
import { messages } from "../locales/en/messages.ts";

export const i18n = setupI18n({ locale: "en", messages: { en: messages } });
