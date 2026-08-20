/**
 * Better Auth client. Session cookie is HttpOnly — this client never touches a token.
 * `basePath` is `/api/auth` (API mounts at `/auth/*`, browser reaches it under `/api`).
 */

import { createAuthClient } from "better-auth/react";

import { apiBaseUrl } from "../shared/api/client.ts";

export const authClient = createAuthClient({
  basePath: `${apiBaseUrl}/auth`,
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
}
