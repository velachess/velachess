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

import {
  accountMethodsQuery,
  deleteAccountFailure,
  PASSWORD_PROVIDER,
  useDeleteAccount,
  type DeleteAccountFailure,
} from "./queries.ts";
import { useQuery } from "../../libs/react-query.ts";
import { z } from "../../libs/zod.ts";

const CONFIRMATION = "DELETE";

const DELETE_COPY = {
  title: msg`Danger zone`,
  hint: msg`Deleting your account is permanent.`,
  open: msg`Delete account`,
  dialogTitle: msg`Delete your account?`,
  dialogDescription: msg`Your profile, connected accounts, imported games and picture are erased from this instance. This can't be undone.`,
  password: msg`Password`,
  passwordRequired: msg`Enter your password.`,
  confirmation: msg`Type ${CONFIRMATION} to confirm`,
  cancel: msg`Cancel`,
  submit: msg`Delete account`,
  deleting: msg`Deleting…`,
} as const;

const FAILURE_COPY: Record<DeleteAccountFailure, MessageDescriptor> = {
  "wrong-password": msg`That password isn't right.`,
  "sign-in-again": msg`For your security, sign out and sign back in, then try again.`,
  unavailable: msg`Couldn't delete your account. Try again.`,
};

export function DeleteAccount() {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const deletion = useDeleteAccount();

  function handleOpenChange(next: boolean) {
    if (deletion.isPending) return;
    deletion.reset();
    setOpen(next);
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
          {open && (
            <DeleteAccountForm deletion={deletion} onDeleted={() => setOpen(false)} />
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Mounted with the dialog, so reopening it starts from empty fields. */
function DeleteAccountForm({
  deletion,
  onDeleted,
}: {
  deletion: ReturnType<typeof useDeleteAccount>;
  onDeleted: () => void;
}) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const methods = useQuery(accountMethodsQuery);

  const hasPassword =
    methods.data?.some((method) => method.providerId === PASSWORD_PROVIDER) ?? false;

  const form = useForm({
    defaultValues: { password: "", confirmation: "" },
    onSubmit: async ({ value }) => {
      const proof: { password?: string } = {};
      if (hasPassword) proof.password = value.password;
      try {
        await deletion.mutateAsync(proof);
      } catch {
        return;
      }
      onDeleted();
      await navigate({ to: "/login", replace: true });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.handleSubmit();
  }

  return (
    <form className="contents" onSubmit={handleSubmit}>
      <AlertDialogHeader>
        <AlertDialogTitle>{i18n._(DELETE_COPY.dialogTitle)}</AlertDialogTitle>
        <AlertDialogDescription>
          {i18n._(DELETE_COPY.dialogDescription)}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <FieldGroup>
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

        {deletion.isError && (
          <FieldError>
            {i18n._(FAILURE_COPY[deleteAccountFailure(deletion.error)])}
          </FieldError>
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
                confirmation !== CONFIRMATION || methods.isPending || deletion.isPending
              }
            >
              {deletion.isPending && i18n._(DELETE_COPY.deleting)}
              {!deletion.isPending && i18n._(DELETE_COPY.submit)}
            </Button>
          )}
        </form.Subscribe>
      </AlertDialogFooter>
    </form>
  );
}
