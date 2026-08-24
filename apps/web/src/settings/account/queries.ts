/**
 * Account reads and writes, all of them Better Auth's own endpoints.
 *
 * Nothing here talks to our API: identity is Better Auth's to own, and a
 * second write path to the same rows is how the two get to disagree.
 */

import { authClient } from "../../auth/client.ts";
import { fetchSession, sessionQueryKey } from "../../auth/session.ts";
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "../../shared/libs/query/index.ts";

/**
 * A way of signing in that this account actually has.
 *
 * `credential` is Better Auth's provider id for email+password; every other
 * id is a social provider. The distinction matters to the screen: the
 * password row talks about a password, the Google row about an account
 * elsewhere.
 */
export const PASSWORD_PROVIDER = "credential";

export interface SignInMethod {
  providerId: string;
  createdAt: string;
}

export const accountMethodsQuery = queryOptions({
  queryKey: ["auth", "accounts"] as const,
  queryFn: async (): Promise<SignInMethod[]> => {
    const { data, error } = await authClient.listAccounts();
    if (error) throw new Error(`could not list sign-in methods (${error.status})`);

    return (data ?? []).map((account) => ({
      providerId: account.providerId,
      createdAt: String(account.createdAt),
    }));
  },
});

/**
 * Renames the person, nothing else.
 *
 * Email is deliberately not writable here: changing it is a verification
 * flow (Better Auth's `changeEmail` sends to the current address first),
 * and this build has no mail transport. A field that looks editable and
 * silently is not would be worse than a read-only one.
 */
export function useRenameSelf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await authClient.updateUser({ name });
      if (error) throw new Error(`could not update profile (${error.status})`);
    },
    onSuccess: async () => {
      // The session query is where the rest of the app reads the name
      // from — the shell's user menu included — so it is refreshed from
      // the server rather than patched locally.
      queryClient.setQueryData(sessionQueryKey, await fetchSession());
    },
  });
}
