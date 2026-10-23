/** One shared query rather than Better Auth's `useSession()`, which would
 * be a second cache of the same fact. */

import { authClient, toSessionUser, type SessionUser } from "./client.ts";
import { queryOptions } from "../libs/react-query.ts";
import { NetworkError } from "../api/index.ts";

export const sessionQueryKey = ["auth", "session"] as const;

/**
 * Better Auth resolves rather than throws: a 401 is "answered, nobody",
 * and any other error means the question was never answered.
 */
async function fetchSession(): Promise<SessionUser | null> {
  const { data, error } = await authClient.getSession();

  if (error) {
    if (error.status === 401) return null;
    throw new NetworkError(`Session lookup failed (${error.status})`);
  }

  if (!data?.user) return null;
  return toSessionUser(data.user);
}

export const sessionQuery = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: fetchSession,
  // A stale session is a wrong session.
  staleTime: 0,
  // The guard awaits this, and a retry ladder in front of a redirect is a
  // longer blank screen before the same outcome.
  retry: false,
});

export type SessionState =
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

/** Never rejects: every outcome, a dead backend included, is a value the
 * guard branches on. */
export async function resolveSession(queryClient: {
  ensureQueryData: (options: typeof sessionQuery) => Promise<SessionUser | null>;
}): Promise<SessionState> {
  try {
    const user = await queryClient.ensureQueryData(sessionQuery);
    return user ? { status: "authenticated", user } : { status: "unauthenticated" };
  } catch {
    // The lookup failed rather than answering "signed out"; the caller
    // sends people to the login screen, reachable without a session.
    return { status: "unavailable" };
  }
}
