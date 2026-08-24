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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@velachess/ui/components/item";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { GoogleIcon, KeyRoundIcon } from "@velachess/ui/icons";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { accountMethodsQuery, PASSWORD_PROVIDER, useRenameSelf } from "./queries.ts";
import { sessionQuery } from "../../auth/session.ts";
import { UserAvatar } from "../../auth/user-avatar.tsx";
import { useQuery } from "../../shared/libs/query/index.ts";
import { z } from "../../shared/libs/zod.ts";

const ACCOUNT_COPY = {
  title: msg`Account`,
  description: msg`Your identity on this instance, and how you sign in to it.`,
  profile: msg`Profile`,
  name: msg`Name`,
  nameHint: msg`How you're shown in the app.`,
  nameRequired: msg`Enter a name.`,
  email: msg`Email`,
  emailFixed: msg`Your email is tied to how you signed up and can't be changed here.`,
  save: msg`Save`,
  saving: msg`Saving…`,
  saved: msg`Saved.`,
  saveFailed: msg`Couldn't save that. Try again.`,
  methods: msg`Sign-in methods`,
  methodsHint: msg`Ways you can get into this account.`,
  methodsFailed: msg`Couldn't load your sign-in methods.`,
  google: msg`Google`,
  googleActive: msg`Connected — you can sign in with Google.`,
  password: msg`Email and password`,
  passwordActive: msg`Set — you can sign in with your email and password.`,
  connections: msg`Chess.com and Lichess are game sources, not sign-in methods. They live under Import.`,
} as const;

/**
 * Settings → Account.
 *
 * Two questions, in the order people ask them: who am I here, and how do I
 * get back in. Nothing else — no session list, no delete-account, no
 * password change — because each of those is a control that has to work,
 * and Better Auth's `changeEmail`/`forgetPassword` paths want a mail
 * transport this build does not have. An empty "Danger zone" heading
 * would only teach people the page is unfinished.
 *
 * Sign-in methods are read, never written, for the same reason: unlinking
 * the only method on an account locks the person out of it, and the guard
 * for that ("is there another way in?") is a decision, not a checkbox.
 */
export function AccountScreen() {
  const { i18n } = useLingui();
  const { data: user } = useQuery(sessionQuery);
  const methods = useQuery(accountMethodsQuery);
  const rename = useRenameSelf();

  const form = useForm({
    defaultValues: { name: user?.name ?? "" },
    onSubmit: async ({ value }) => {
      // The mutation holds the failure; the submit handler is the end of
      // the chain, so rethrowing here would land as an unhandled rejection.
      await rename.mutateAsync(value.name.trim()).catch(() => undefined);
    },
  });

  // The route guard resolved the session before this rendered; `user`
  // being absent means it has just been invalidated and a redirect is
  // already in flight.
  if (!user) return null;

  const linked = new Set(methods.data?.map((method) => method.providerId));

  return (
    <>
      <PageHeader
        title={i18n._(ACCOUNT_COPY.title)}
        description={i18n._(ACCOUNT_COPY.description)}
      />

      <div className="flex flex-col gap-8 px-6 py-6">
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">{i18n._(ACCOUNT_COPY.profile)}</h2>

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
                  onSubmit: z.string().trim().min(1, i18n._(ACCOUNT_COPY.nameRequired)),
                }}
              >
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        {i18n._(ACCOUNT_COPY.name)}
                      </FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        autoComplete="name"
                        aria-invalid={isInvalid}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        disabled={rename.isPending}
                      />
                      <FieldDescription>{i18n._(ACCOUNT_COPY.nameHint)}</FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  );
                }}
              </form.Field>

              {/* Shown because people look for it, disabled because
                  changing it is a verification flow this build cannot
                  complete. Saying so is the whole point of the field. */}
              <Field>
                <FieldLabel htmlFor="account-email">
                  {i18n._(ACCOUNT_COPY.email)}
                </FieldLabel>
                <Input id="account-email" value={user.email} readOnly disabled />
                <FieldDescription>{i18n._(ACCOUNT_COPY.emailFixed)}</FieldDescription>
              </Field>

              <Field orientation="horizontal">
                <Button type="submit" disabled={rename.isPending}>
                  {rename.isPending
                    ? i18n._(ACCOUNT_COPY.saving)
                    : i18n._(ACCOUNT_COPY.save)}
                </Button>
                {rename.isSuccess && !rename.isPending && (
                  <FieldDescription>{i18n._(ACCOUNT_COPY.saved)}</FieldDescription>
                )}
                {rename.isError && (
                  <FieldError>{i18n._(ACCOUNT_COPY.saveFailed)}</FieldError>
                )}
              </Field>
            </FieldGroup>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-medium">{i18n._(ACCOUNT_COPY.methods)}</h2>
            <p className="text-sm text-muted-foreground">
              {i18n._(ACCOUNT_COPY.methodsHint)}
            </p>
          </div>

          {methods.isPending ? (
            <Skeleton className="h-24 w-full max-w-md" />
          ) : methods.isError ? (
            <p className="text-sm text-muted-foreground">
              {i18n._(ACCOUNT_COPY.methodsFailed)}
            </p>
          ) : (
            <ItemGroup className="max-w-md rounded-lg border">
              {linked.has("google") && (
                <>
                  <Item>
                    <ItemMedia>
                      <GoogleIcon className="size-5" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{i18n._(ACCOUNT_COPY.google)}</ItemTitle>
                      <ItemDescription>
                        {i18n._(ACCOUNT_COPY.googleActive)}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                  {linked.has(PASSWORD_PROVIDER) && <ItemSeparator />}
                </>
              )}

              {linked.has(PASSWORD_PROVIDER) && (
                <Item>
                  <ItemMedia>
                    <KeyRoundIcon className="size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{i18n._(ACCOUNT_COPY.password)}</ItemTitle>
                    <ItemDescription>
                      {i18n._(ACCOUNT_COPY.passwordActive)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              )}
            </ItemGroup>
          )}

          {/* The line the issue asks for in words: a chess account is a
              source of games, not a way into this one. */}
          <p className="max-w-md text-xs text-muted-foreground">
            {i18n._(ACCOUNT_COPY.connections)}
          </p>
        </section>
      </div>
    </>
  );
}
