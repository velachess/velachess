/**
 * Server ends the session, then the app forgets. Clearing the client
 * first would show logged-out UI over a still-valid cookie.
 */

import { authClient } from "../client.ts";
import { sessionQueryKey } from "../session.ts";
import { useMutation, useQueryClient } from "../../shared/libs/query/index.ts";

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    // Settled, not success: even if the request failed, this browser
    // should stop showing somebody's games — the next protected request
    // will 401 anyway.
    onSettled: () => {
      queryClient.setQueryData(sessionQueryKey, null);
      queryClient.clear();
    },
  });
}
