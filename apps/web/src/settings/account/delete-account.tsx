import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";
import { toast } from "@velachess/ui/components/toast";

import { accountMethodsQuery, PASSWORD_PROVIDER, useDeleteAccount } from "./queries.ts";
import { useQuery } from "../../libs/react-query.ts";
import { z } from "../../libs/zod.ts";

const CONFIRMATION = "DELETE";

const DELETE_COPY = {
  title: msg`Danger zone`,
  hint: msg`Deleting your account is permanent.`,
  open: msg`Delete account`,
  dialogTitle: msg`Delete your account?`,
  dialogDescription: msg`Your profile, connected accounts, imported games and picture are erased from this instance, and the analyses saved in this browser are cleared. This can't be undone.`,
  password: msg`Password`,
  passwordRequired: msg`Enter your password.`,
  methodsFailed: msg`Couldn't check how you sign in.`,
  retry: msg`Try again`,
  confirmation: msg`Type ${CONFIRMATION} to confirm`,
  cancel: msg`Cancel`,
  submit: msg`Delete account`,
  deleting: msg`Deleting…`,
  wrongPassword: msg`That password isn't right.`,
  signInAgain: msg`For your security, sign out and sign back in, then try again.`,
  failed: msg`Couldn't delete your account. Try again.`,
  deleted: msg`Account deleted`,
  storageBlocked: msg`Analyses saved in this browser weren't erased yet: another VelaChess tab is using them. Close your other tabs, or clear this site's data.`,
  storageFailed: msg`Analyses saved in this browser couldn't be erased. Clear this site's data to remove them.`,
} as const;

/** Better Auth's refusal travels as the thrown error's `cause`. */
function refusalCopy(error: Error): MessageDescriptor {
  const { cause } = error;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return DELETE_COPY.failed;
  }
  if (cause.code === "INVALID_PASSWORD") return DELETE_COPY.wrongPassword;
  if (cause.code === "SESSION_EXPIRED") return DELETE_COPY.signInAgain;
  return DELETE_COPY.failed;
}

export function DeleteAccount() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const methods = useQuery(accountMethodsQuery);
  const deletion = useDeleteAccount();

  const hasPassword =
    methods.data?.some((method) => method.providerId === PASSWORD_PROVIDER) ?? false;

  const form = useForm({
    defaultValues: { password: "", confirmation: "" },
    onSubmit: async ({ value }) => {
      const proof: { password?: string } = {};
      if (hasPassword) proof.password = value.password;
      const storage = await deletion.mutateAsync(proof).catch(() => null);
      if (storage === null) return;

      setOpen(false);
      await navigate({ to: "/login", replace: true });
      if (storage === "blocked") {
        toast.add({
          type: "warning",
          title: i18n._(DELETE_COPY.deleted),
          description: i18n._(DELETE_COPY.storageBlocked),
        });
      }
      if (storage === "failed") {
        toast.add({
          type: "error",
          title: i18n._(DELETE_COPY.deleted),
          description: i18n._(DELETE_COPY.storageFailed),
        });
      }
    },
  });

  function handleOpenChange(next: boolean) {
    if (deletion.isPending) return;
    if (next) {
      form.reset();
      deletion.reset();
    }
    setOpen(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit();
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium text-destructive">
          {i18n._(DELETE_COPY.title)}
        </h3>
        <p className="text-sm text-muted-foreground">{i18n._(DELETE_COPY.hint)}</p>
      </div>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogTrigger
          render={<Button variant="destructive" className="self-start" />}
        >
          {i18n._(DELETE_COPY.open)}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form className="contents" onSubmit={handleSubmit}>
            <AlertDialogHeader>
              <AlertDialogTitle>{i18n._(DELETE_COPY.dialogTitle)}</AlertDialogTitle>
              <AlertDialogDescription>
                {i18n._(DELETE_COPY.dialogDescription)}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <FieldGroup>
              {methods.isError && (
                <Field orientation="horizontal">
                  <FieldError>{i18n._(DELETE_COPY.methodsFailed)}</FieldError>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void methods.refetch()}
                  >
                    {i18n._(DELETE_COPY.retry)}
                  </Button>
                </Field>
              )}

              {hasPassword && (
                <form.Field
                  name="password"
                  validators={{
                    onSubmit: z.string().min(1, i18n._(DELETE_COPY.passwordRequired)),
                  }}
                >
                  {(field) => (
                    <Field data-invalid={!field.state.meta.isValid}>
                      <FieldLabel htmlFor="delete-account-password">
                        {i18n._(DELETE_COPY.password)}
                      </FieldLabel>
                      <Input
                        id="delete-account-password"
                        type="password"
                        autoComplete="current-password"
                        aria-invalid={!field.state.meta.isValid}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        disabled={deletion.isPending}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
              )}

              <form.Field name="confirmation">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="delete-account-confirmation">
                      {i18n._(DELETE_COPY.confirmation)}
                    </FieldLabel>
                    <Input
                      id="delete-account-confirmation"
                      autoComplete="off"
                      spellCheck={false}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      disabled={deletion.isPending}
                    />
                  </Field>
                )}
              </form.Field>

              {deletion.error && (
                <FieldError>{i18n._(refusalCopy(deletion.error))}</FieldError>
              )}
            </FieldGroup>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletion.isPending}>
                {i18n._(DELETE_COPY.cancel)}
              </AlertDialogCancel>
              <form.Subscribe selector={(state) => state.values.confirmation}>
                {(confirmation) => (
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={
                      confirmation !== CONFIRMATION ||
                      !methods.isSuccess ||
                      deletion.isPending
                    }
                  >
                    {deletion.isPending && i18n._(DELETE_COPY.deleting)}
                    {!deletion.isPending && i18n._(DELETE_COPY.submit)}
                  </Button>
                )}
              </form.Subscribe>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
