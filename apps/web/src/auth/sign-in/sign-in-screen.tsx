import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";

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
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";
import { VelaChessMark } from "@velachess/ui/icons";

import { signInFailureOf, type SignInFailure } from "./sign-in.ts";
import { useSignIn } from "./use-sign-in.ts";
import { z } from "../../shared/libs/zod.ts";

const SIGN_IN_COPY = {
  title: msg`Welcome back`,
  description: msg`Sign in to your VelaChess instance.`,
  email: msg`Email`,
  password: msg`Password`,
  submit: msg`Sign in`,
  submitting: msg`Signing in…`,
  invalidCredentials: msg`Invalid email or password.`,
  unavailable: msg`Couldn't reach the server. Try again in a moment.`,
  emailRequired: msg`Enter your email.`,
  emailInvalid: msg`That doesn't look like an email address.`,
  passwordRequired: msg`Enter your password.`,
} as const;

const FAILURE_COPY: Record<
  SignInFailure,
  (typeof SIGN_IN_COPY)[keyof typeof SIGN_IN_COPY]
> = {
  "invalid-credentials": SIGN_IN_COPY.invalidCredentials,
  unavailable: SIGN_IN_COPY.unavailable,
};

/**
 * The one screen reachable without a session.
 *
 * Laid out as shadcn's login block: a muted full-height page, the brand
 * lockup centred above a `max-w-sm` card, a centred card header, and the
 * form as one `FieldGroup`.
 *
 * What the block ships that this build does not: OAuth buttons and their
 * separator, "forgot your password", and a sign-up link. None of the
 * three exists on the server — `/auth/sign-up/email` answers 400 and the
 * first user is provisioned at startup (docs/how-to/self-host.md) — and
 * a control that cannot do anything is worse than an absent one.
 *
 * Where it lands afterwards is the router's business, not this form's:
 * `redirect` carries where the person was headed before the guard
 * intervened.
 */
export function SignInScreen({ redirect }: { redirect?: string }) {
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
        // Held by the mutation and rendered below. Rethrowing would end
        // the chain in an unhandled rejection — the submit handler is
        // the end of the chain.
        return;
      }

      await navigate({ to: redirect ?? "/", replace: true });
    },
  });

  const failure = signIn.isError ? signInFailureOf(signIn.error) : null;

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
              <CardDescription>{i18n._(SIGN_IN_COPY.description)}</CardDescription>
            </CardHeader>

            <CardContent>
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
                            placeholder="you@example.com"
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
