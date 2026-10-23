/**
 * Identity goes through Better Auth's own endpoints, which own those
 * records. The avatar is the exception: Better Auth stores no binaries, so
 * the bytes go to our API and it writes the resulting URL onto
 * `user.image`. Both paths invalidate the session query, the one place the
 * app reads the avatar
 * from.
 */

import { api, parseResponse } from "../../api/index.ts";
import { authClient } from "../../auth/client.ts";
import { sessionQueryKey } from "../../auth/session.ts";
import { queryOptions, useMutation, useQueryClient } from "../../libs/react-query.ts";

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

/** Renames only: email needs `changeEmail`'s verification flow, and this
 * build has no mail transport. */
export function useRenameSelf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await authClient.updateUser({ name });
      if (error) throw new Error(`could not update profile (${error.status})`);
    },
    onSuccess: () => {
      // Invalidate rather than refetch-then-set, so a network blip does not
      // turn a rename that succeeded into a shown failure.
      return queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}

/**
 * A single spread of a 100 KB array into `String.fromCharCode` overflows
 * the argument limit in every engine, and reads as a corrupt upload.
 */
const CHUNK = 8 * 1024;

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary);
}

export function useSetAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blob: Blob) =>
      parseResponse(api.me.avatar.$post({ json: { image: await toBase64(blob) } })),
    // The shell and this screen both read the avatar from the session
    // query, so one invalidation refreshes both.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
  });
}

/** The server records the removal as deliberate, so a later sign-in does
 * not restore a provider picture over it. */
export function useRemoveAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.me.avatar.$delete();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
  });
}
