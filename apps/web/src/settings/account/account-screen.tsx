import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Separator } from "@velachess/ui/components/separator";

import { ProfileForm } from "./profile-form.tsx";
import { SignInMethods } from "./sign-in-methods.tsx";
import { sessionQuery } from "../../auth/session.ts";
import { useQuery } from "../../libs/react-query.ts";

const ACCOUNT_COPY = {
  title: msg`Account`,
  description: msg`Your identity on this instance, and how you sign in to it.`,
} as const;

/** Settings → Account: who am I here, and how do I get back in. */
export function AccountScreen() {
  const { i18n } = useLingui();
  const { data: user } = useQuery(sessionQuery);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">{i18n._(ACCOUNT_COPY.title)}</h2>
        <p className="text-sm text-muted-foreground">
          {i18n._(ACCOUNT_COPY.description)}
        </p>
      </div>

      <ProfileForm user={user} />
      <Separator />
      <SignInMethods />
    </div>
  );
}
