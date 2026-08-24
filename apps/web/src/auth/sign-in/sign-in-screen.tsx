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

// shadcn's login block wording, kept as-is where the control exists.
// The description is the one line that varies by deployment: the block's
// "Login with your Apple or Google account" names providers, so it can
// only name the ones this instance actually offers.
const SIGN_IN_COPY = {
  title: msg`Welcome back`,
  descriptionGoogle: msg`Login with your Google account`,
  descriptionPassword: msg`Enter your email below to login to your account`,
  email: msg`Email`,
  password: msg`Password`,
  submit: msg`Login`,
  submitting: msg`Logging in…`,
  invalidCredentials: msg`Invalid email or password.`,
  unavailable: msg`Couldn't reach the server. Try again in a moment.`,
  emailRequired: msg`Enter your email.`,
  emailInvalid: msg`That doesn't look like an email address.`,
  passwordRequired: msg`Enter your password.`,
  google: msg`Login with Google`,
  or: msg`Or continue with`,
  googleCancelled: msg`Google sign-in was cancelled.`,
  googleFailed: msg`Google sign-in didn't complete. Try again.`,
} as const;

const FAILURE_COPY: Record<
  SignInFailure,
  (typeof SIGN_IN_COPY)[keyof typeof SIGN_IN_COPY]
> = {
  "invalid-credentials": SIGN_IN_COPY.invalidCredentials,
  unavailable: SIGN_IN_COPY.unavailable,
};

/**
 * Two ways a Google attempt comes back here, and they are not the same
 * event: the person said no, or something broke. Better Auth puts the
 * reason in `?error=`; `access_denied` is OAuth's own code for a refused
 * consent screen, and everything else — a stale state, a provider
 * timeout, a misconfigured client — reads as a failure worth retrying.
 *
 * The provider's raw code is never rendered. It is written for whoever
 * reads a log, not for someone who just wanted to sign in.
 */
function oauthErrorCopy(code: string) {
  return code === "access_denied"
    ? SIGN_IN_COPY.googleCancelled
    : SIGN_IN_COPY.googleFailed;
}

/**
 * The one screen reachable without a session.
 *
 * Laid out as shadcn's login block: a muted full-height page, the brand
 * lockup centred above a `max-w-sm` card, a centred card header, and the
 * form as one `FieldGroup`.
 *
 * Which methods appear is the server's answer, not this file's guess:
 * `signInMethodsQuery` reads `GET /config`, so a self-host without Google
 * credentials renders no Google button. A control that cannot do anything
 * is worse than an absent one — the same reason there is still no
 * "forgot your password" or sign-up link: `/auth/sign-up/email` answers
 * 400 by design and password recovery needs an SMTP dependency this build
 * does not have. Public sign-up, where it is wanted, is Google's path.
 *
 * Where it lands afterwards is the router's business, not this form's:
 * `redirect` carries where the person was headed before the guard
 * intervened, and it is the same destination for both methods.
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
        // Held by the mutation and rendered below. Rethrowing would end
        // the chain in an unhandled rejection — the submit handler is
        // the end of the chain.
        return;
      }

      await navigate({ to: redirect ?? "/", replace: true });
    },
  });

  const failure = signIn.isError ? signInFailureOf(signIn.error) : null;
  const [googlePending, setGooglePending] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);

  // Two sources, one message: a code Better Auth handed back through the
  // URL, or a request that never reached the provider at all.
  const oauthMessage = googleFailed
    ? SIGN_IN_COPY.googleFailed
    : oauthError
      ? oauthErrorCopy(oauthError)
      : null;

  const startGoogle = async () => {
    setGoogleFailed(false);
    setGooglePending(true);
    try {
      await signInWithGoogle({ callbackURL: redirect ?? "/" });
      // Reached only if the browser did not navigate away.
    } catch {
      setGoogleFailed(true);
    } finally {
      setGooglePending(false);
    }
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {/* The lockup, not a link: there is nowhere to go from here
            without a session, and a dead anchor is a promise the page
            cannot keep. `bg-brand`, not `bg-primary` — the tile is
            decoration, not a control. */}
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
                  {/* Rendered whether or not the button below is, and
                      that is the point: if the provider was switched off
                      between the redirect out and the return, the person
                      still gets told why they are back here instead of
                      inside the app. */}
                  {oauthMessage !== null && (
                    <Field>
                      <FieldError>{i18n._(oauthMessage)}</FieldError>
                    </Field>
                  )}

                  {/* Above the password fields, because it is the faster
                      path for anyone who has it, and because a provider
                      button below a submit button reads as a second
                      submit. Rendered only where the server says the
                      provider exists. */}
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

                          {/* A rejected sign-in, as plain inline text under
                              the last field — no panel, no border, nothing
                              that looks like another input.
                              Deliberately NOT marked on the password input:
                              the server cannot say which half was wrong, and
                              a red ring around one field would claim it
                              could. The server's own wording never reaches
                              here either — it is written for developers, and
                              "user not found" would answer the question the
                              generic message refuses to. */}
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
