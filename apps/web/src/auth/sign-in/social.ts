/**
 * Starts social sign-in through Better Auth.
 *
 * Better Auth owns the OAuth flow and the provider callback
 * (`/api/auth/callback/google` — Google's return leg, not this file's
 * concern). This module only defines where the user lands after that:
 * `successURL` on success, `errorCallbackOf(redirect)` on failure.
 */

import { authClient } from "../client.ts";

interface SocialSignInTargets {
  /** Where to land once the session cookie is set — not the OAuth
   * provider callback, which Better Auth builds itself. */
  successURL: string;
  /** Interrupted destination, kept through the failure leg too. */
  redirect?: string | undefined;
}

// Better Auth appends ?error= (or &error= when a query exists); the
// login route re-validates `redirect` as an internal path on arrival.
function errorCallbackOf(redirect: string | undefined): string {
  return redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";
}

/**
 * Starts the Google flow. Resolves only if the redirect never happened —
 * on success the browser has already left this document.
 */
export async function signInWithGoogle({
  successURL,
  redirect,
}: SocialSignInTargets): Promise<void> {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: successURL,
    errorCallbackURL: errorCallbackOf(redirect),
  });

  if (error) {
    throw new Error(`social sign-in failed (${error.status ?? "network"})`);
  }
}
