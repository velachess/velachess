import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";
import { GoogleIcon } from "@velachess/ui/icons";

import { AuthCard } from "../auth-card.tsx";

import { signInFailureOf, type SignInFailure } from "./sign-in.ts";
import { signInWithGoogle } from "./social.ts";
import { useSignIn } from "./use-sign-in.ts";
import { signInMethodsQuery } from "../sign-in-methods.ts";
import { useQuery } from "../../libs/react-query.ts";
import { z } from "../../libs/zod.ts";

// Neutral because the provider button also creates the account on first
// use, and email registration does not exist.
const SIGN_IN_COPY = {
  title: msg`Continue to VelaChess`,
  descriptionGoogle: msg`Continue with Google or sign in with your account credentials.`,
  descriptionPassword: msg`Sign in with your account credentials.`,
  email: msg`Email`,
  password: msg`Password`,
  submit: msg`Sign in`,
  submitting: msg`Signing in…`,
  invalidCredentials: msg`Invalid email or password.`,
  unavailable: msg`Couldn't reach the server. Try again in a moment.`,
  emailRequired: msg`Enter your email.`,
  emailInvalid: msg`That doesn't look like an email address.`,
  passwordRequired: msg`Enter your password.`,
  google: msg`Continue with Google`,
  or: msg`Or continue with`,
  googleCancelled: msg`Google sign-in was cancelled.`,
  googleFailed: msg`Google sign-in didn't complete. Try again.`,
  googleAccountNotLinked: msg`An account already exists with that email. Sign in with your password instead.`,
  forgotPassword: msg`Forgot password?`,
  emailNotVerified: msg`Confirm your email first. We sent a new link to your inbox.`,
  verificationLinkInvalid: msg`That confirmation link is invalid or has expired. Sign in to get a new one.`,
} as const;

const FAILURE_COPY: Record<
  SignInFailure,
  (typeof SIGN_IN_COPY)[keyof typeof SIGN_IN_COPY]
> = {
  "invalid-credentials": SIGN_IN_COPY.invalidCredentials,
  "email-not-verified": SIGN_IN_COPY.emailNotVerified,
  unavailable: SIGN_IN_COPY.unavailable,
};

/** What Better Auth's verify-email endpoint appends when its link fails. */
const VERIFICATION_ERRORS = new Set(["INVALID_TOKEN", "TOKEN_EXPIRED", "USER_NOT_FOUND"]);

const OAUTH_ERROR_ACCESS_DENIED = "access_denied";
/** Better Auth refusing to attach Google to an existing password account,
 * where retrying never succeeds. */
const OAUTH_ERROR_ACCOUNT_NOT_LINKED = "account_not_linked";

// Everything else reads as retryable, and the raw code is never rendered.
function oauthErrorCopy(code: string) {
  if (VERIFICATION_ERRORS.has(code)) return SIGN_IN_COPY.verificationLinkInvalid;
  if (code === OAUTH_ERROR_ACCESS_DENIED) return SIGN_IN_COPY.googleCancelled;
  if (code === OAUTH_ERROR_ACCOUNT_NOT_LINKED) return SIGN_IN_COPY.googleAccountNotLinked;
  return SIGN_IN_COPY.googleFailed;
}

/**
 * Which methods appear is the server's answer (`GET /config`), so an
 * instance without Google credentials renders no dead button.
 */
export function SignInScreen({
  redirect,
  oauthError,
}: {
  redirect?: string;
  /** `?error=` as Better Auth returned it. */
  oauthError?: string;
}) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const signIn = useSignIn();
  const { data: methods } = useQuery(signInMethodsQuery);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      try {
        await signIn.mutateAsync({
          email: value.email.trim(),
          password: value.password,
        });
      } catch {
        // The mutation holds it and the screen renders it below;
        // rethrowing leaves the rejection unhandled.
        return;
      }

      await navigate({ to: redirect ?? "/", replace: true });
    },
  });

  const failure = signIn.isError ? signInFailureOf(signIn.error) : null;
  const [googlePending, setGooglePending] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);

  const oauthMessage = googleFailed
    ? SIGN_IN_COPY.googleFailed
    : oauthError
      ? oauthErrorCopy(oauthError)
      : null;

  const startGoogle = async () => {
    setGoogleFailed(false);
    setGooglePending(true);
    try {
      await signInWithGoogle({ successURL: redirect ?? "/", redirect });
      // No `finally`: on success the browser is navigating away, and
      // re-enabling the button lets a click race that navigation.
    } catch {
      setGoogleFailed(true);
      setGooglePending(false);
    }
  };

  return (
    <AuthCard
      title={i18n._(SIGN_IN_COPY.title)}
      description={i18n._(
        methods?.google
          ? SIGN_IN_COPY.descriptionGoogle
          : SIGN_IN_COPY.descriptionPassword,
      )}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          {/* Rendered even when the button below is not — the
                      person must learn why they are back here even if the
                      provider was switched off meanwhile. */}
          {oauthMessage !== null && (
            <Field>
              <FieldError>{i18n._(oauthMessage)}</FieldError>
            </Field>
          )}

          {methods?.google && (
            <>
              <Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={googlePending || signIn.isPending}
                  onClick={() => void startGoogle()}
                >
                  <GoogleIcon className="size-4" />
                  {i18n._(SIGN_IN_COPY.google)}
                </Button>
              </Field>

              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                {i18n._(SIGN_IN_COPY.or)}
              </FieldSeparator>
            </>
          )}

          <form.Field
            name="email"
            validators={{
              onSubmit: z
                .string()
                .min(1, i18n._(SIGN_IN_COPY.emailRequired))
                .refine((value) => value.includes("@"), {
                  message: i18n._(SIGN_IN_COPY.emailInvalid),
                }),
            }}
          >
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    {i18n._(SIGN_IN_COPY.email)}
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
              onSubmit: z.string().min(1, i18n._(SIGN_IN_COPY.passwordRequired)),
            }}
          >
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <div className="flex items-center">
                    <FieldLabel htmlFor={field.name}>
                      {i18n._(SIGN_IN_COPY.password)}
                    </FieldLabel>
                    {methods?.passwordReset && (
                      <Link
                        to="/forgot-password"
                        className="ml-auto text-sm underline-offset-4 hover:underline"
                      >
                        {i18n._(SIGN_IN_COPY.forgotPassword)}
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

                  {/* Not marked on the input: the server will not
                              say which half was wrong, so no field may
                              claim to know. */}
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
                    {pending
                      ? i18n._(SIGN_IN_COPY.submitting)
                      : i18n._(SIGN_IN_COPY.submit)}
                  </Button>
                );
              }}
            </form.Subscribe>
          </Field>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
