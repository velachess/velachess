/**
 * Better Auth client. Session cookie is HttpOnly — this client never touches a token.
 * `basePath` is `/api/auth` (API mounts at `/auth/*`, browser reaches it under `/api`).
 */

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import { apiBaseUrl } from "../api/index.ts";

export const authClient = createAuthClient({
  basePath: `${apiBaseUrl}/auth`,
  // Declared server-side in libs/infra/auth's `user.additionalFields`;
  // stated again here so the client types the field it already
  // receives. Spelled out rather than inferred from the server's Auth
  // type, which apps/web has no reason to import.
  plugins: [inferAdditionalFields({ user: { onboardedAt: { type: "date" } } })],
  fetchOptions: {
    // Looked up per call instead of captured at import. The client is
    // built when this module loads, which in tests is before MSW has
    // patched `globalThis.fetch` — binding early would send every auth
    // request to the real network and quietly skip the interceptor.
    customFetchImpl: (...args) => globalThis.fetch(...args),
  },
});

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Better Auth's `user.image` — the provider's picture, for accounts
   * that came from one. `null` for an email/password account, which is
   * why every consumer needs a fallback rather than an `<img>`. */
  image: string | null;
  /**
   * Whether this person finished onboarding. A boolean, not the stamp:
   * the only question any screen asks is whether there is one, and
   * carrying the timestamp meant converting it on every read for nobody.
   *
   * Server-stamped on their first connection and carried on the session,
   * so the tour does not come back on a new browser — or after
   * disconnecting every account.
   */
  onboarded: boolean;
}

/** Better Auth's own session user, inferred from this client's own
 * configuration — including `onboardedAt`, which the plugin above adds. */
type AuthUser = (typeof authClient.$Infer.Session)["user"];

/**
 * Better Auth's user into this app's `SessionUser` — narrower on purpose:
 * no `emailVerified`, no `createdAt`, nothing a screen does not render.
 *
 * One place because two call sites built it identically, the session
 * query and the sign-in mutation, and both had to make the same two
 * decisions: absent `image` means `null`, and onboarding is a yes/no.
 *
 * No date handling here. Better Auth's client parses its own responses
 * with a reviver that turns any ISO string into a `Date`, so the stamp
 * never arrives as text — and nothing in this app reads it as text
 * either. Asking `!= null` is total: there is no malformed value to guard
 * against, rather than a guard to maintain.
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
