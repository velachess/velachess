/**
 * What this deployment lets people sign in with.
 *
 * A self-hosted instance with no Google credentials must not be offered a
 * "Continue with Google" button — it would redirect to an error and there
 * is nothing the person could do about it. The server answers this at
 * `GET /config`, which is public precisely because the question is asked
 * before anyone has a session.
 */

import { api, parseResponse } from "../shared/api/client.ts";
import { queryOptions } from "../shared/libs/query/index.ts";

export interface SignInMethods {
  password: boolean;
  google: boolean;
}

/**
 * Password only. Used when the request fails — a login screen that renders
 * nothing because a capability lookup 500'd is worse than one that offers
 * the method every instance has.
 */
const FALLBACK: SignInMethods = { password: true, google: false };

export const signInMethodsQuery = queryOptions({
  queryKey: ["auth", "sign-in-methods"] as const,
  queryFn: async (): Promise<SignInMethods> => {
    try {
      const { signInMethods } = await parseResponse(api.config.$get());
      return signInMethods;
    } catch {
      return FALLBACK;
    }
  },
  // Capabilities change when the server is redeployed, not while someone
  // is looking at the login form.
  staleTime: Infinity,
});
