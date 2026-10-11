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
  /** When this person finished onboarding, `null` if they never have.
   * Server-stamped on their first connection and carried on the session,
   * so the tour does not come back on a new browser — or after
   * disconnecting every account. */
  onboardedAt: string | null;
}
