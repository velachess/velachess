import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Separator } from "@velachess/ui/components/separator";

import { DeleteAccount } from "./delete-account.tsx";
import { ProfileForm } from "./profile-form.tsx";
import { SignInMethods } from "./sign-in-methods.tsx";
import { SignOutEverywhere } from "./sign-out-everywhere.tsx";
import { sessionQuery } from "../../auth/session.ts";
import { useQuery } from "../../libs/react-query.ts";
import { SettingsSection } from "../layout/settings-section.tsx";

const ACCOUNT_COPY = {
  title: msg`Account`,
  description: msg`Your identity on this instance, and how you sign in to it.`,
} as const;

export function AccountScreen() {
  const { i18n } = useLingui();
  const { data: user } = useQuery(sessionQuery);

  if (!user) return null;

  return (
    <SettingsSection
      title={i18n._(ACCOUNT_COPY.title)}
      description={i18n._(ACCOUNT_COPY.description)}
    >
      <ProfileForm user={user} />
      <Separator />
      <SignInMethods />
      <Separator />
      <SignOutEverywhere />
      <Separator />
      <DeleteAccount />
    </SettingsSection>
  );
}
