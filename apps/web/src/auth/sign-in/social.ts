/**
 * Social sign-in: hand the browser to the provider and let Better Auth own
 * the rest.
 *
 * Nothing here implements OAuth. `signIn.social` asks the server for an
 * authorization URL — the server mints the `state` and the PKCE challenge,
 * keeps the client secret, and is the only party that ever sees the code —
 * and the browser navigates to it. What comes back lands on
 * `/auth/callback/google`, which is the API's route, not the SPA's.
 *
 * The one thing this file owns is where the person ends up afterwards, in
 * all three outcomes: signed in, cancelled, or failed.
 */

import { authClient } from "../client.ts";

/** Better Auth appends `?error=…` when it sends the browser here. */
const OAUTH_ERROR_PATH = "/login";

interface SocialSignInTargets {
  /** Where to land once the session cookie is set. */
  callbackURL: string;
}

/**
 * Starts the Google flow. Resolves only if the redirect never happened —
 * on success the browser has already left this document.
 */
export async function signInWithGoogle({
  callbackURL,
}: SocialSignInTargets): Promise<void> {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL,
    // A cancelled or rejected consent screen comes back to the login page
    // with an error code rather than to a blank Better Auth error route.
    errorCallbackURL: OAUTH_ERROR_PATH,
    // No `newUserCallbackURL`: a first sign-in and a returning one land in
    // the same place. Onboarding is decided by what the account holds, not
    // by which URL the browser arrived on.
  });

  if (error) {
    // The provider was never reached — the request to our own server
    // failed. Surfaced the same way a returned `?error=` is.
    throw new Error(`social sign-in failed (${error.status ?? "network"})`);
  }
}
