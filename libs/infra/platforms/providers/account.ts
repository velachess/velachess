/**
 * Only the status is read: a 404 is a handle that does not exist, and
 * anything else unhappy is an outage that must never be reported as one.
 */

import type { AccountPlatform, FetchFn } from "../schema.ts";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;
const USER_AGENT = "velachess-ingest (+https://github.com/yurimutti/velachess)";
const HEADERS = { Accept: "application/json", "User-Agent": USER_AGENT };

/** A provider that accepts the request but never answers must not hold a
 * connect open. */
const FETCH_TIMEOUT_MS = 5000;

export type AccountCheck =
  | { status: "exists" }
  | { status: "failed"; reason: "not-found" | "unavailable" };

const ENDPOINTS = {
  chess_com: (username: string) => `https://api.chess.com/pub/player/${username}`,
  lichess: (username: string) => `https://lichess.org/api/user/${username}`,
} as const satisfies Record<AccountPlatform, (username: string) => string>;

export async function verifyAccountExists(
  platform: AccountPlatform,
  username: string,
  opts: { fetch?: FetchFn } = {},
): Promise<AccountCheck> {
  // A name no provider accepts cannot exist there.
  if (!USERNAME_PATTERN.test(username)) return { status: "failed", reason: "not-found" };
  const doFetch = opts.fetch ?? globalThis.fetch;

  try {
    const res = await doFetch(ENDPOINTS[platform](username), {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "failed", reason: "not-found" };
    return res.ok ? { status: "exists" } : { status: "failed", reason: "unavailable" };
  } catch {
    return { status: "failed", reason: "unavailable" };
  }
}
