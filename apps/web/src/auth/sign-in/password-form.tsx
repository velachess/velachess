import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";

import { Button } from "@velachess/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";

import { signInFailureOf, type SignInFailure } from "./sign-in.ts";
import { useSignIn } from "./use-sign-in.ts";
import { z } from "../../libs/zod.ts";

const PASSWORD_COPY = {
  email: msg`Email`,
  password: msg`Password`,
  submit: msg`Sign in`,
  submitting: msg`Signing in…`,
  invalidCredentials: msg`Invalid email or password.`,
  unavailable: msg`Couldn't reach the server. Try again in a moment.`,
  emailRequired: msg`Enter your email.`,
  emailInvalid: msg`That doesn't look like an email address.`,
  passwordRequired: msg`Enter your password.`,
  forgotPassword: msg`Forgot password?`,
  emailNotVerified: msg`Confirm your email first. We sent a new link to your inbox.`,
} as const;

const FAILURE_COPY: Record<
  SignInFailure,
  (typeof PASSWORD_COPY)[keyof typeof PASSWORD_COPY]
> = {
  "invalid-credentials": PASSWORD_COPY.invalidCredentials,
  "email-not-verified": PASSWORD_COPY.emailNotVerified,
  unavailable: PASSWORD_COPY.unavailable,
};

export function PasswordForm({
  redirect,
  passwordReset,
}: {
  redirect?: string | undefined;
  passwordReset: boolean;
}) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const signIn = useSignIn();

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      try {
        await signIn.mutateAsync({
          email: value.email.trim(),
          password: value.password,
        });
      } catch {
        // The mutation holds the error for the screen; rethrowing leaves it unhandled.
        return;
      }

      await navigate({ to: redirect ?? "/", replace: true });
    },
  });

  const failure = signIn.isError ? signInFailureOf(signIn.error) : null;

  return (
    <form
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
              .min(1, i18n._(PASSWORD_COPY.emailRequired))
              .refine((value) => value.includes("@"), {
                message: i18n._(PASSWORD_COPY.emailInvalid),
              }),
          }}
        >
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  {i18n._(PASSWORD_COPY.email)}
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  aria-invalid={isInvalid}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={signIn.isPending}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <form.Field
          name="password"
          validators={{
            onSubmit: z.string().min(1, i18n._(PASSWORD_COPY.passwordRequired)),
          }}
        >
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <div className="flex items-center">
                  <FieldLabel htmlFor={field.name}>
                    {i18n._(PASSWORD_COPY.password)}
                  </FieldLabel>
                  {passwordReset && (
                    <Link
                      to="/forgot-password"
                      className="ml-auto text-sm underline-offset-4 hover:underline"
                    >
                      {i18n._(PASSWORD_COPY.forgotPassword)}
                    </Link>
                  )}
                </div>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={isInvalid}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  disabled={signIn.isPending}
                />
                <FieldError errors={field.state.meta.errors} />

                {failure !== null && (
                  <FieldError>{i18n._(FAILURE_COPY[failure])}</FieldError>
                )}
              </Field>
            );
          }}
        </form.Field>

        <Field>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => {
              const pending = isSubmitting || signIn.isPending;
              return (
                <Button type="submit" disabled={pending}>
                  {pending && i18n._(PASSWORD_COPY.submitting)}
                  {!pending && i18n._(PASSWORD_COPY.submit)}
                </Button>
              );
            }}
          </form.Subscribe>
        </Field>
      </FieldGroup>
    </form>
  );
}
