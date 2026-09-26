/**
 * Account reads/writes. Identity goes through Better Auth's own endpoints —
 * name, sign-in methods — because it owns those records.
 *
 * The avatar is the exception, and not an inconsistency: Better Auth stores
 * no binaries, so the bytes go to our API and it writes the resulting URL
 * onto `user.image` itself. Both paths end the same way, invalidating the
 * session query, because that is the single place the app reads the avatar
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

/**
 * Base64 in chunks. A single spread of a 100 KB array into
 * `String.fromCharCode` overflows the argument limit in every engine, and
 * the failure looks like a corrupt upload rather than a stack error.
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

/** Uploads the cropped image and lets the server decide its URL. */
export function useSetAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blob: Blob) =>
      parseResponse(api.me.avatar.$post({ json: { image: await toBase64(blob) } })),
    // Same reason as useRenameSelf: the shell and this screen both read the
    // avatar from the session query, so one invalidation refreshes both.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
  });
}

/** Back to initials. The server records the removal as deliberate, so a
 * later sign-in does not restore a provider picture over it. */
export function useRemoveAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.me.avatar.$delete();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
  });
}
