import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldSeparator,
} from "@velachess/ui/components/field";
import { GoogleIcon } from "@velachess/ui/icons";

import { AuthCard } from "../auth-card.tsx";

import { MagicLinkForm } from "./magic-link-form.tsx";
import { PasswordForm } from "./password-form.tsx";
import { signInWithGoogle } from "./social.ts";
import { signInMethodsQuery } from "../sign-in-methods.ts";
import { useQuery } from "../../libs/react-query.ts";

const SIGN_IN_COPY = {
  title: msg`Continue to VelaChess`,
  description: msg`Review your chess games with Stockfish.`,
  switchToPassword: msg`Sign in with a password instead`,
  switchToLink: msg`Email me a sign-in link instead`,
  google: msg`Continue with Google`,
  or: msg`Or continue with`,
  googleCancelled: msg`Google sign-in was cancelled.`,
  googleFailed: msg`Google sign-in didn't complete. Try again.`,
  googleAccountNotLinked: msg`An account already exists with that email. Sign in with your password instead.`,
  verificationLinkInvalid: msg`That link is invalid or has expired. Sign in to get a new one.`,
} as const;

const VERIFICATION_ERRORS = new Set(["INVALID_TOKEN", "TOKEN_EXPIRED", "USER_NOT_FOUND"]);

const OAUTH_ERROR_ACCESS_DENIED = "access_denied";
const OAUTH_ERROR_ACCOUNT_NOT_LINKED = "account_not_linked";

function oauthErrorCopy(code: string) {
  if (VERIFICATION_ERRORS.has(code)) return SIGN_IN_COPY.verificationLinkInvalid;
  if (code === OAUTH_ERROR_ACCESS_DENIED) return SIGN_IN_COPY.googleCancelled;
  if (code === OAUTH_ERROR_ACCOUNT_NOT_LINKED) return SIGN_IN_COPY.googleAccountNotLinked;
  return SIGN_IN_COPY.googleFailed;
}

function oauthMessageOf(googleFailed: boolean, oauthError: string | undefined) {
  if (googleFailed) return SIGN_IN_COPY.googleFailed;
  if (oauthError) return oauthErrorCopy(oauthError);
  return null;
}

export function SignInScreen({
  redirect,
  oauthError,
}: {
  redirect?: string;
  oauthError?: string;
}) {
  const { i18n } = useLingui();
  const { data: methods } = useQuery(signInMethodsQuery);

  const [googlePending, setGooglePending] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [passwordChosen, setPasswordChosen] = useState(false);

  const google = methods?.google === true;
  const magicLink = methods?.magicLink === true;
  const password = methods?.password === true;
  const showPassword = password && (!magicLink || passwordChosen);
  const showMagicLink = magicLink && !showPassword;
  const canSwitch = magicLink && password;

  const oauthMessage = oauthMessageOf(googleFailed, oauthError);

  const startGoogle = async () => {
    setGoogleFailed(false);
    setGooglePending(true);
    try {
      await signInWithGoogle({ successURL: redirect ?? "/", redirect });
      // No `finally`: re-enabling the button would race the navigation away.
    } catch {
      setGoogleFailed(true);
      setGooglePending(false);
    }
  };

  return (
    <AuthCard
      title={i18n._(SIGN_IN_COPY.title)}
      description={i18n._(SIGN_IN_COPY.description)}
      footer={
        canSwitch && (
          <Button
            type="button"
            variant="link"
            onClick={() => setPasswordChosen(!passwordChosen)}
          >
            {passwordChosen && i18n._(SIGN_IN_COPY.switchToLink)}
            {!passwordChosen && i18n._(SIGN_IN_COPY.switchToPassword)}
          </Button>
        )
      }
    >
      <FieldGroup>
        {oauthMessage !== null && (
          <Field>
            <FieldError>{i18n._(oauthMessage)}</FieldError>
          </Field>
        )}

        {google && (
          <Field>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={googlePending}
              onClick={() => void startGoogle()}
            >
              <GoogleIcon />
              {i18n._(SIGN_IN_COPY.google)}
            </Button>
          </Field>
        )}

        {google && (showPassword || showMagicLink) && (
          <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
            {i18n._(SIGN_IN_COPY.or)}
          </FieldSeparator>
        )}

        {showMagicLink && <MagicLinkForm redirect={redirect} />}

        {showPassword && (
          <PasswordForm
            redirect={redirect}
            passwordReset={methods?.passwordReset === true}
          />
        )}
      </FieldGroup>
    </AuthCard>
  );
}
