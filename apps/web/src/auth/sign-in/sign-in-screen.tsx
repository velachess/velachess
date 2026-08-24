import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@velachess/ui/components/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";
import { GoogleIcon, VelaChessMark } from "@velachess/ui/icons";

import { signInFailureOf, type SignInFailure } from "./sign-in.ts";
import { signInWithGoogle } from "./social.ts";
import { useSignIn } from "./use-sign-in.ts";
import { signInMethodsQuery } from "../sign-in-methods.ts";
import { useQuery } from "../../shared/libs/query/index.ts";
import { z } from "../../shared/libs/zod.ts";

// Neutral copy: with Google enabled, the provider button also creates
// the account on first use — never assume the visitor is returning, and
// never promise email registration (it does not exist).
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
} as const;

const FAILURE_COPY: Record<
  SignInFailure,
  (typeof SIGN_IN_COPY)[keyof typeof SIGN_IN_COPY]
> = {
  "invalid-credentials": SIGN_IN_COPY.invalidCredentials,
  unavailable: SIGN_IN_COPY.unavailable,
};

/** OAuth's own "the person said no". */
const OAUTH_ERROR_ACCESS_DENIED = "access_denied";
/** Better Auth refusing to attach Google to an existing password account —
 * retrying never succeeds, so it gets its own copy. */
const OAUTH_ERROR_ACCOUNT_NOT_LINKED = "account_not_linked";

// Everything else reads as a retryable failure. The raw code is never
// rendered.
function oauthErrorCopy(code: string) {
  if (code === OAUTH_ERROR_ACCESS_DENIED) return SIGN_IN_COPY.googleCancelled;
  if (code === OAUTH_ERROR_ACCOUNT_NOT_LINKED) return SIGN_IN_COPY.googleAccountNotLinked;
  return SIGN_IN_COPY.googleFailed;
}

/**
 * The one screen reachable without a session. Which methods appear is
 * the server's answer (`GET /config`), so an instance without Google
 * credentials renders no dead button.
 */
export function SignInScreen({
  redirect,
  oauthError,
}: {
  redirect?: string;
  /** `?error=` as Better Auth returned it after a Google attempt. */
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
        // Held by the mutation and rendered below; rethrowing would be
        // an unhandled rejection.
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
      // re-enabling the button here would let a click race that navigation
      // and start a second flow before it lands.
    } catch {
      setGoogleFailed(true);
      setGooglePending(false);
    }
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-brand text-primary-foreground">
            <VelaChessMark
              size="micro"
              className="size-4 [&>*]:fill-primary-foreground"
              aria-hidden
            />
          </div>
          VelaChess
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{i18n._(SIGN_IN_COPY.title)}</CardTitle>
              <CardDescription>
                {i18n._(
                  methods?.google
                    ? SIGN_IN_COPY.descriptionGoogle
                    : SIGN_IN_COPY.descriptionPassword,
                )}
              </CardDescription>
            </CardHeader>

            <CardContent>
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
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid;

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
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid;

                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>
                            {i18n._(SIGN_IN_COPY.password)}
                          </FieldLabel>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
