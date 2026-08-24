/** What this deployment lets people sign in with — `GET /config`,
 * public because it is asked before anyone has a session. */

import { api, parseResponse } from "../shared/api/client.ts";
import { queryOptions } from "../shared/libs/query/index.ts";

export interface SignInMethods {
  password: boolean;
  google: boolean;
}

// On failure, offer the method every instance has.
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
  staleTime: Infinity,
});
