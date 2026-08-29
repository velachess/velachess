/** Account reads/writes — Better Auth's own endpoints, never our API. */

import { authClient } from "../../auth/client.ts";
import { sessionQueryKey } from "../../auth/session.ts";
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "../../shared/libs/query/index.ts";

/** Better Auth's provider id for email+password. */
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

/** Renames only. Email needs `changeEmail`'s verification flow, and
 * this build has no mail transport. */
export function useRenameSelf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await authClient.updateUser({ name });
      if (error) throw new Error(`could not update profile (${error.status})`);
    },
    onSuccess: () => {
      // The shell reads the name from the session query — refresh it.
      // Invalidate rather than refetch-then-set: a network blip here must
      // not turn a rename that already succeeded into a shown failure.
      return queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}
