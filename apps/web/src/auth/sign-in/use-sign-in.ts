/**
 * Identity transition: `removeQueries` (not invalidate — the previous
 * user's data must not stay visible), then seed the session from the
 * sign-in response, so no follow-up fetch can fail a successful sign-in.
 */

import { signIn, type Credentials } from "./sign-in.ts";
import { sessionQueryKey } from "../session.ts";
import { useMutation, useQueryClient } from "../../shared/libs/query/index.ts";

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: Credentials) => signIn(credentials),
    onSuccess: (user) => {
      queryClient.removeQueries();
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}
