import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@velachess/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";

import { useMutation } from "../../libs/react-query.ts";
import { z } from "../../libs/zod.ts";
import { AuthCard } from "../auth-card.tsx";
import { resetPassword, type PasswordResetOutcome } from "./password-reset.ts";

const RESET_COPY = {
  title: msg`Choose a new password`,
  newPassword: msg`New password`,
  confirmPassword: msg`Confirm new password`,
  tooShort: msg`Use at least 8 characters.`,
  mismatch: msg`Passwords don't match.`,
  submit: msg`Change password`,
  submitting: msg`Changing…`,
  changed: msg`Your password was changed. Sign in with the new one.`,
  signIn: msg`Sign in`,
  invalidLink: msg`This reset link is invalid or has expired.`,
  requestNewLink: msg`Request a new link`,
  unavailable: msg`Couldn't reach the server. Try again in a moment.`,
} as const;

// Better Auth's default `minPasswordLength`.
const MIN_PASSWORD_LENGTH = 8;

type ResetScreenState = "form" | PasswordResetOutcome;

function resetScreenState(
  token: string | undefined,
  outcome: PasswordResetOutcome | undefined,
): ResetScreenState {
  if (!token) return "invalid-token";
  if (outcome) return outcome;
  return "form";
}

export function ResetPasswordScreen({ token }: { token?: string }) {
  const { i18n } = useLingui();
  const reset = useMutation({ mutationFn: resetPassword });
  const state = resetScreenState(token, reset.data);

  const passwordsSchema = z
    .object({
      newPassword: z.string().min(MIN_PASSWORD_LENGTH, i18n._(RESET_COPY.tooShort)),
      confirmPassword: z.string(),
    })
    .refine((value) => value.newPassword === value.confirmPassword, {
      path: ["confirmPassword"],
      error: i18n._(RESET_COPY.mismatch),
    });

  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: { onSubmit: passwordsSchema },
    onSubmit: ({ value }) => {
      if (token) reset.mutate({ newPassword: value.newPassword, token });
    },
  });

  return (
    <AuthCard title={i18n._(RESET_COPY.title)}>
      <FieldGroup>
        {state === "changed" && (
          <Field>
            <FieldDescription>{i18n._(RESET_COPY.changed)}</FieldDescription>
            <Link to="/login" className={buttonVariants({ size: "lg" })}>
              {i18n._(RESET_COPY.signIn)}
            </Link>
          </Field>
        )}

        {state === "invalid-token" && (
          <Field>
            <FieldError>{i18n._(RESET_COPY.invalidLink)}</FieldError>
            <Link
              to="/forgot-password"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {i18n._(RESET_COPY.requestNewLink)}
            </Link>
          </Field>
        )}

        {state === "form" && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="newPassword">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        {i18n._(RESET_COPY.newPassword)}
                      </FieldLabel>
                      <Input
                        className="h-9"
                        id={field.name}
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={isInvalid}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        disabled={reset.isPending}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="confirmPassword">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        {i18n._(RESET_COPY.confirmPassword)}
                      </FieldLabel>
                      <Input
                        className="h-9"
                        id={field.name}
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={isInvalid}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        disabled={reset.isPending}
                      />
                      <FieldError errors={field.state.meta.errors} />
                      {reset.isError && (
                        <FieldError>{i18n._(RESET_COPY.unavailable)}</FieldError>
                      )}
                    </Field>
                  );
                }}
              </form.Field>

              <Field>
                <Button type="submit" size="lg" disabled={reset.isPending}>
                  {reset.isPending && i18n._(RESET_COPY.submitting)}
                  {!reset.isPending && i18n._(RESET_COPY.submit)}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )}
      </FieldGroup>
    </AuthCard>
  );
}
