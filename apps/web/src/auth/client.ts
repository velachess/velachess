/**
 * The session cookie is HttpOnly, so this client never touches a token. The
 * API mounts at `/auth/*` and the browser reaches it under `/api`.
 */

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import { apiBaseUrl } from "../api/index.ts";

export const authClient = createAuthClient({
  basePath: `${apiBaseUrl}/auth`,
  // Declared server-side in libs/infra/auth's `user.additionalFields`, and
  // mirrored rather than inferred from the server's `Auth` type, which
  // apps/web does not import.
  plugins: [inferAdditionalFields({ user: { onboardedAt: { type: "date" } } })],
  fetchOptions: {
    // Looked up per call: this module loads before MSW has patched
    // `globalThis.fetch`, and binding early sends every auth request to the
    // real network.
    customFetchImpl: (...args) => globalThis.fetch(...args),
  },
});

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Better Auth's `user.image`, null for an email/password account, which
   * is why every consumer needs a fallback. */
  image: string | null;
  /**
   * A boolean rather than the stamp, which no screen asks for.
   *
   * Server-stamped on the first connection and carried on the session, so
   * the tour does not come back on a new browser, or after disconnecting
   * every account.
   */
  onboarded: boolean;
}

type AuthUser = (typeof authClient.$Infer.Session)["user"];

/**
 * Narrower than Better Auth's user on purpose: nothing a screen does not
 * render. No date handling, because Better Auth's client revives any ISO
 * string into a `Date`, so the stamp never arrives as text.
 */
export function toSessionUser(user: AuthUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    onboarded: user.onboardedAt != null,
  };
}
