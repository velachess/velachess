import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId } from "react";

import { Alert, AlertTitle } from "@velachess/ui/components/alert";
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
import { GoogleIcon, KeyRoundIcon, MailIcon, OctagonXIcon } from "@velachess/ui/icons";

import { accountMethodsQuery, PASSWORD_PROVIDER } from "./queries.ts";
import { signInMethodsQuery } from "../../auth/sign-in-methods.ts";
import { useQuery } from "../../libs/react-query.ts";

const METHODS_COPY = {
  title: msg`Sign-in methods`,
  hint: msg`Ways you can get into this account.`,
  failed: msg`Couldn't load your sign-in methods.`,
  google: msg`Google`,
  googleActive: msg`Connected — you can sign in with Google.`,
  password: msg`Email and password`,
  passwordActive: msg`Set — you can sign in with your email and password.`,
  emailLink: msg`Email link`,
  emailLinkActive: msg`On — you can sign in with a link sent to your email.`,
} as const;

/** Read-only — unlinking the last method locks the person out, and that
 * guard is a decision, not a button this screen can render. */
export function SignInMethods() {
  const { i18n } = useLingui();
  const methods = useQuery(accountMethodsQuery);
  const { data: instance } = useQuery(signInMethodsQuery);
  const failedId = useId();

  const linked = new Set(methods.data?.map((method) => method.providerId));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">{i18n._(METHODS_COPY.title)}</h3>
        <p className="text-sm text-muted-foreground">{i18n._(METHODS_COPY.hint)}</p>
      </div>

      {methods.isPending && <Skeleton className="h-24 w-full" />}

      {methods.isError && (
        <Alert variant="destructive" aria-labelledby={failedId}>
          <OctagonXIcon aria-hidden="true" />
          <AlertTitle id={failedId}>{i18n._(METHODS_COPY.failed)}</AlertTitle>
        </Alert>
      )}

      {methods.isSuccess && (
        <ItemGroup className="rounded-lg border">
          {linked.has("google") && (
            <>
              <Item>
                <ItemMedia>
                  <GoogleIcon className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{i18n._(METHODS_COPY.google)}</ItemTitle>
                  <ItemDescription>{i18n._(METHODS_COPY.googleActive)}</ItemDescription>
                </ItemContent>
              </Item>
              {(linked.has(PASSWORD_PROVIDER) || instance?.magicLink) && (
                <ItemSeparator />
              )}
            </>
          )}

          {linked.has(PASSWORD_PROVIDER) && (
            <>
              <Item>
                <ItemMedia>
                  <KeyRoundIcon className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{i18n._(METHODS_COPY.password)}</ItemTitle>
                  <ItemDescription>{i18n._(METHODS_COPY.passwordActive)}</ItemDescription>
                </ItemContent>
              </Item>
              {instance?.magicLink && <ItemSeparator />}
            </>
          )}

          {instance?.magicLink && (
            <Item>
              <ItemMedia>
                <MailIcon className="size-5" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{i18n._(METHODS_COPY.emailLink)}</ItemTitle>
                <ItemDescription>{i18n._(METHODS_COPY.emailLinkActive)}</ItemDescription>
              </ItemContent>
            </Item>
          )}
        </ItemGroup>
      )}
    </section>
  );
}
