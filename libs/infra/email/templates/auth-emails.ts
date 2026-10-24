import type { I18n } from "@lingui/core";

import type { ActionEmailProps } from "./action-email.ts";

type AuthEmailCopy = Omit<ActionEmailProps, "locale" | "url"> & { subject: string };

// Explicit ids, spelled as the English text: no macro transform runs on the server.
const fallback = (i18n: I18n) =>
  i18n._({ id: "If the button doesn't work, open this link:" });

export const AUTH_EMAIL_COPY = {
  "reset-password": (i18n: I18n): AuthEmailCopy => ({
    subject: i18n._({ id: "Reset your VelaChess password" }),
    preview: i18n._({ id: "Use this link to choose a new password." }),
    heading: i18n._({ id: "Reset your password" }),
    body: i18n._({
      id: "Someone asked to reset the password for your VelaChess account. Choose a new one with the button below.",
    }),
    action: i18n._({ id: "Choose a new password" }),
    fallback: fallback(i18n),
    ignore: i18n._({
      id: "If you didn't ask for this, ignore this email. Your password stays the same.",
    }),
  }),
  "verify-email": (i18n: I18n): AuthEmailCopy => ({
    subject: i18n._({ id: "Confirm your email for VelaChess" }),
    preview: i18n._({ id: "Confirm this address to finish setting up your account." }),
    heading: i18n._({ id: "Confirm your email" }),
    body: i18n._({
      id: "Confirm this is your email address to finish setting up your VelaChess account.",
    }),
    action: i18n._({ id: "Confirm email" }),
    fallback: fallback(i18n),
    ignore: i18n._({
      id: "If you didn't create a VelaChess account, ignore this email.",
    }),
  }),
};

export type AuthEmailTemplate = keyof typeof AUTH_EMAIL_COPY;
