/**
 * Social sign-in. OAuth itself (state, PKCE, secrets) is Better Auth's,
 * server-side; the return lands on `/auth/callback/google` — the API's
 * route, not the SPA's. This file only decides where the person ends up.
 */

import { authClient } from "../client.ts";

interface SocialSignInTargets {
  /** Where to land once the session cookie is set. */
  callbackURL: string;
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
  callbackURL,
  redirect,
}: SocialSignInTargets): Promise<void> {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL,
    errorCallbackURL: errorCallbackOf(redirect),
  });

  if (error) {
    throw new Error(`social sign-in failed (${error.status ?? "network"})`);
  }
}
