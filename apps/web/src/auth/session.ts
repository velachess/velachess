/** One shared session query/cache, not Better Auth's own `useSession()` — avoids a second cache of the same fact. */

import { authClient, type SessionUser } from "./client.ts";
import { queryOptions } from "../shared/libs/query/index.ts";
import { NetworkError } from "../shared/api/errors.ts";

export const sessionQueryKey = ["auth", "session"] as const;

/**
 * Better Auth resolves rather than throws: a 401 means "answered, nobody";
 * any other error means the question was never actually answered.
 */
export async function fetchSession(): Promise<SessionUser | null> {
  const { data, error } = await authClient.getSession();

  if (error) {
    if (error.status === 401) return null;
    throw new NetworkError(`Session lookup failed (${error.status})`);
  }

  if (!data?.user) return null;
  const { id, email, name, image } = data.user;
  // `image` is optional in Better Auth's type and absent for a
  // password-only account; normalized to null so consumers branch on one
  // shape instead of two.
  return { id, email, name, image: image ?? null };
}

export const sessionQuery = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: fetchSession,
  // A stale session is a wrong session — always ask.
  staleTime: 0,
  // The guard awaits this; a retry ladder in front of a redirect is just
  // a longer blank screen before the same outcome.
  retry: false,
});

export type SessionState =
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

/** Route-guard entry point. Never rejects — every outcome, including a dead backend, is a value the guard branches on. */
export async function resolveSession(queryClient: {
  ensureQueryData: (options: typeof sessionQuery) => Promise<SessionUser | null>;
}): Promise<SessionState> {
  try {
    const user = await queryClient.ensureQueryData(sessionQuery);
    return user ? { status: "authenticated", user } : { status: "unauthenticated" };
  } catch {
    // Lookup failed, not "signed out" — the caller sends people to the
    // login screen, which is reachable without a session.
    return { status: "unavailable" };
  }
}
