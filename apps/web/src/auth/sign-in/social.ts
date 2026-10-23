/**
 * Better Auth owns the OAuth flow and the provider callback; this only
 * says where the person lands after it.
 */

import { authClient } from "../client.ts";

interface SocialSignInTargets {
  /** Where to land once the session cookie is set, not the provider
   * callback Better Auth builds itself. */
  successURL: string;
  /** Kept through the failure leg too. */
  redirect?: string | undefined;
}

// Better Auth appends ?error= (or &error= when a query exists), and the
// login route re-validates `redirect` as an internal path on arrival.
function errorCallbackOf(redirect: string | undefined): string {
  return redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";
}

/** Resolves only if the redirect never happened: on success the browser
 * has already left this document. */
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
