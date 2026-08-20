/** Session cache is set from the sign-in response, not refetched — avoids a window where the guard still reads "signed out". */

import { signIn, type Credentials } from "./sign-in.ts";
import { fetchSession, sessionQueryKey } from "../session.ts";
import { useMutation, useQueryClient } from "../../shared/libs/query/index.ts";

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: Credentials) => signIn(credentials),
    onSuccess: async () => {
      queryClient.setQueryData(sessionQueryKey, await fetchSession());
      // Everything cached under the previous visitor is now somebody
      // else's data. Dropping it is cheaper than auditing every key.
      await queryClient.invalidateQueries();
    },
  });
}
