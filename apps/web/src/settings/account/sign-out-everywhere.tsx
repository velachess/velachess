import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@velachess/ui/components/button";
import { FieldError } from "@velachess/ui/components/field";

import { useSignOutEverywhere } from "./queries.ts";

const SIGN_OUT_EVERYWHERE_COPY = {
  title: msg`Sessions`,
  hint: msg`Sign this account out on every device, this one included.`,
  submit: msg`Sign out everywhere`,
  pending: msg`Signing out…`,
  failed: msg`Couldn't sign out everywhere. Try again.`,
} as const;

export function SignOutEverywhere() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const signOut = useSignOutEverywhere();

  async function handleSignOutEverywhere() {
    try {
      await signOut.mutateAsync();
    } catch {
      return;
    }
    await navigate({ to: "/login", replace: true });
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">{i18n._(SIGN_OUT_EVERYWHERE_COPY.title)}</h3>
        <p className="text-sm text-muted-foreground">
          {i18n._(SIGN_OUT_EVERYWHERE_COPY.hint)}
        </p>
      </div>

      <Button
        variant="outline"
        className="self-start"
        disabled={signOut.isPending}
        onClick={() => void handleSignOutEverywhere()}
      >
        {signOut.isPending && i18n._(SIGN_OUT_EVERYWHERE_COPY.pending)}
        {!signOut.isPending && i18n._(SIGN_OUT_EVERYWHERE_COPY.submit)}
      </Button>

      {signOut.isError && (
        <FieldError>{i18n._(SIGN_OUT_EVERYWHERE_COPY.failed)}</FieldError>
      )}
    </section>
  );
}
