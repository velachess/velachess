import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";

import { Button } from "@velachess/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";

import { useRenameSelf } from "./queries.ts";
import type { SessionUser } from "../../auth/client.ts";
import { UserAvatar } from "../../auth/user-avatar.tsx";
import { z } from "../../shared/libs/zod.ts";

const PROFILE_COPY = {
  title: msg`Profile`,
  name: msg`Name`,
  nameHint: msg`How you're shown in the app.`,
  nameRequired: msg`Enter a name.`,
  nameTooLong: msg`Keep it under 100 characters.`,
  email: msg`Email`,
  emailFixed: msg`Your email is tied to how you signed up and can't be changed here.`,
  save: msg`Save`,
  saving: msg`Saving…`,
  saved: msg`Saved.`,
  saveFailed: msg`Couldn't save that. Try again.`,
} as const;

export function ProfileForm({ user }: { user: SessionUser }) {
  const { i18n } = useLingui();
  const rename = useRenameSelf();

  const form = useForm({
    defaultValues: { name: user.name },
    onSubmit: async ({ value }) => {
      await rename.mutateAsync(value.name.trim()).catch(() => undefined);
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-medium">{i18n._(PROFILE_COPY.title)}</h3>

      <div className="flex items-center gap-3">
        <UserAvatar user={user} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <form
        className="max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field
            name="name"
            validators={{
              onSubmit: z
                .string()
                .trim()
                .min(1, i18n._(PROFILE_COPY.nameRequired))
                .max(100, i18n._(PROFILE_COPY.nameTooLong)),
            }}
          >
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    {i18n._(PROFILE_COPY.name)}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="name"
                    aria-invalid={isInvalid}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      // Otherwise "Saved." (or a stale error) outlives
                      // the edit it no longer describes.
                      rename.reset();
                    }}
                    disabled={rename.isPending}
                  />
                  <FieldDescription>{i18n._(PROFILE_COPY.nameHint)}</FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              );
            }}
          </form.Field>

          <Field>
            <FieldLabel htmlFor="account-email">{i18n._(PROFILE_COPY.email)}</FieldLabel>
            <Input id="account-email" value={user.email} readOnly disabled />
            <FieldDescription>{i18n._(PROFILE_COPY.emailFixed)}</FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending ? i18n._(PROFILE_COPY.saving) : i18n._(PROFILE_COPY.save)}
            </Button>
            {rename.isSuccess && !rename.isPending && (
              <FieldDescription>{i18n._(PROFILE_COPY.saved)}</FieldDescription>
            )}
            {rename.isError && <FieldError>{i18n._(PROFILE_COPY.saveFailed)}</FieldError>}
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
