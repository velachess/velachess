import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";

import { Button } from "@velachess/ui/components/button";
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
import { requestPasswordReset } from "./password-reset.ts";

const FORGOT_COPY = {
  title: msg`Reset your password`,
  description: msg`Enter your account's email and we'll send you a link to choose a new password.`,
  email: msg`Email`,
  emailInvalid: msg`That doesn't look like an email address.`,
  submit: msg`Send reset link`,
  submitting: msg`Sending…`,
  sent: msg`If an account exists for that email, a reset link is on its way.`,
  unavailable: msg`Couldn't reach the server. Try again in a moment.`,
  backToSignIn: msg`Back to sign in`,
} as const;

export function ForgotPasswordScreen() {
  const { i18n } = useLingui();
  const request = useMutation({ mutationFn: requestPasswordReset });

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: ({ value }) => request.mutate(value.email.trim()),
  });

  return (
    <AuthCard
      title={i18n._(FORGOT_COPY.title)}
      description={i18n._(FORGOT_COPY.description)}
    >
      <FieldGroup>
        {request.isSuccess && (
          <Field>
            <FieldDescription>{i18n._(FORGOT_COPY.sent)}</FieldDescription>
          </Field>
        )}

        {!request.isSuccess && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field
                name="email"
                validators={{
                  onSubmit: z
                    .string()
                    .trim()
                    .pipe(z.email(i18n._(FORGOT_COPY.emailInvalid))),
                }}
              >
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        {i18n._(FORGOT_COPY.email)}
                      </FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        aria-invalid={isInvalid}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        disabled={request.isPending}
                      />
                      <FieldError errors={field.state.meta.errors} />
                      {request.isError && (
                        <FieldError>{i18n._(FORGOT_COPY.unavailable)}</FieldError>
                      )}
                    </Field>
                  );
                }}
              </form.Field>

              <Field>
                <Button type="submit" disabled={request.isPending}>
                  {request.isPending && i18n._(FORGOT_COPY.submitting)}
                  {!request.isPending && i18n._(FORGOT_COPY.submit)}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )}

        <Field>
          <FieldDescription className="text-center">
            <Link to="/login">{i18n._(FORGOT_COPY.backToSignIn)}</Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </AuthCard>
  );
}
