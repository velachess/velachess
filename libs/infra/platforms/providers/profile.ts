/**
 * Separate from the game providers because profiles change rarely and games
 * every session, so one cadence would waste a request per sync. Both
 * endpoints are public, and the shapes are read off real responses.
 */

import { z } from "zod";

import type { FetchFn } from "../schema.ts";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;
const USER_AGENT = "velachess-ingest (+https://github.com/yurimutti/velachess)";
const HEADERS = { Accept: "application/json", "User-Agent": USER_AGENT };

export interface PlayerProfile {
  /** Absent on Lichess, which has no avatars, and on Chess.com accounts
   * that never uploaded one. */
  avatarUrl: string | null;
  /** Lichess only: a flair id like `people.santa-claus-light-skin-tone`,
   * rendered from Lichess's asset set rather than an image URL. */
  flair: string | null;
  /** ISO 3166-1 alpha-2, uppercase. Null when undeclared. */
  countryCode: string | null;
}

/**
 * `failed` means whatever is cached must stand; `fetched` is an answer even
 * when it carries no avatar, because profiles do get removed.
 */
export type ProfileFetch =
  | { status: "fetched"; profile: PlayerProfile }
  | { status: "failed"; reason: "not-found" | "unavailable" };

const UNAVAILABLE = { status: "failed", reason: "unavailable" } as const;

/** Chess.com's `country` is a link like `.../pub/country/BR`, whose last
 * segment is already the code. */
const ISO_ALPHA2 = /^[A-Za-z]{2}$/;

export function countryCodeFromUrl(url: string | undefined): string | null {
  const suffix = url?.split("/").pop() ?? "";
  return ISO_ALPHA2.test(suffix) ? suffix.toUpperCase() : null;
}

/**
 * `location` is deliberately unread: it is free text, and a real account
 * answers `country: ".../BR"` alongside `location: "Spain"`.
 */
const chessComProfileSchema = z.object({
  avatar: z.string().optional(),
  country: z.string().optional(),
});

/** Lichess omits `profile` until the person fills it, and the endpoint
 * carries no avatar field for any account. */
const lichessProfileSchema = z.object({
  flair: z.string().optional(),
  profile: z.object({ flag: z.string().optional() }).optional(),
});

/** A provider that accepts the request but never answers must not hold a
 * game open; a hung socket routes into the same empty-profile path as any
 * other failure. */
const FETCH_TIMEOUT_MS = 5000;

/** Any error is a failure rather than a definitive empty profile. Only a
 * 404 says the handle does not exist. */
async function fetchJson(
  url: string,
  doFetch: FetchFn,
): Promise<{ body: unknown } | Extract<ProfileFetch, { status: "failed" }>> {
  try {
    const res = await doFetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "failed", reason: "not-found" };
    if (!res.ok) return UNAVAILABLE;
    return { body: await res.json() };
  } catch {
    return UNAVAILABLE;
  }
}

export async function fetchChessComProfile(
  username: string,
  opts: { fetch?: FetchFn } = {},
): Promise<ProfileFetch> {
  // A name no provider accepts cannot exist there.
  if (!USERNAME_PATTERN.test(username)) return { status: "failed", reason: "not-found" };
  const doFetch = opts.fetch ?? globalThis.fetch;

  const fetched = await fetchJson(
    `https://api.chess.com/pub/player/${username}`,
    doFetch,
  );
  if (!("body" in fetched)) return fetched;
  const parsed = chessComProfileSchema.safeParse(fetched.body);
  // An unrecognized shape is not a trustworthy "no avatar": a failed ask
  // clears nothing.
  if (!parsed.success) return UNAVAILABLE;

  return {
    status: "fetched",
    profile: {
      avatarUrl: parsed.data.avatar ?? null,
      flair: null,
      countryCode: countryCodeFromUrl(parsed.data.country),
    },
  };
}

export async function fetchLichessProfile(
  username: string,
  opts: { fetch?: FetchFn } = {},
): Promise<ProfileFetch> {
  // A name no provider accepts cannot exist there.
  if (!USERNAME_PATTERN.test(username)) return { status: "failed", reason: "not-found" };
  const doFetch = opts.fetch ?? globalThis.fetch;

  const fetched = await fetchJson(`https://lichess.org/api/user/${username}`, doFetch);
  if (!("body" in fetched)) return fetched;
  const parsed = lichessProfileSchema.safeParse(fetched.body);
  if (!parsed.success) return UNAVAILABLE;

  const flag = parsed.data.profile?.flag;
  return {
    status: "fetched",
    profile: {
      avatarUrl: null,
      flair: parsed.data.flair ?? null,
      countryCode: ISO_ALPHA2.test(flag ?? "") ? flag!.toUpperCase() : null,
    },
  };
}
