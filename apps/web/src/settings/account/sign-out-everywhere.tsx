import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@velachess/ui/components/alert-dialog";
import { Button } from "@velachess/ui/components/button";
import { FieldError } from "@velachess/ui/components/field";

import { useSignOutEverywhere } from "./queries.ts";

const SIGN_OUT_EVERYWHERE_COPY = {
  title: msg`Sessions`,
  hint: msg`Signed in somewhere you no longer use? End every session of this account.`,
  open: msg`Sign out everywhere`,
  dialogTitle: msg`Sign out everywhere?`,
  dialogDescription: msg`Every device signed in to this account is signed out, this one included. You can sign back in right after.`,
  cancel: msg`Cancel`,
  submit: msg`Sign out everywhere`,
  pending: msg`Signing out…`,
  failed: msg`Couldn't sign out everywhere. Try again.`,
} as const;

export function SignOutEverywhere() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const signOut = useSignOutEverywhere();

  function handleOpenChange(next: boolean) {
    if (signOut.isPending) return;
    if (next) signOut.reset();
    setOpen(next);
  }

  async function handleConfirm() {
    try {
      await signOut.mutateAsync();
    } catch {
      return;
    }
    setOpen(false);
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

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogTrigger render={<Button variant="outline" className="self-start" />}>
          {i18n._(SIGN_OUT_EVERYWHERE_COPY.open)}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {i18n._(SIGN_OUT_EVERYWHERE_COPY.dialogTitle)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {i18n._(SIGN_OUT_EVERYWHERE_COPY.dialogDescription)}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {signOut.isError && (
            <FieldError>{i18n._(SIGN_OUT_EVERYWHERE_COPY.failed)}</FieldError>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={signOut.isPending}>
              {i18n._(SIGN_OUT_EVERYWHERE_COPY.cancel)}
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={signOut.isPending}
              onClick={() => void handleConfirm()}
            >
              {signOut.isPending && i18n._(SIGN_OUT_EVERYWHERE_COPY.pending)}
              {!signOut.isPending && i18n._(SIGN_OUT_EVERYWHERE_COPY.submit)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
