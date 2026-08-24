/**
 * Player profiles — the picture and flag beside a name. Separate from
 * game providers since profiles change rarely and games every session;
 * fetching both on one cadence would waste a request per sync. Both
 * endpoints are public/unauthenticated; shapes read off real responses.
 */

import { z } from "zod";

import type { FetchFn } from "../schema.ts";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;
const USER_AGENT = "velachess-ingest (+https://github.com/yurimutti/velachess)";
const HEADERS = { Accept: "application/json", "User-Agent": USER_AGENT };

export interface PlayerProfile {
  /** Absent on Lichess, which has no avatars at all, and on Chess.com
   * accounts that never uploaded one. */
  avatarUrl: string | null;
  /** Lichess only — a flair id like `people.santa-claus-light-skin-tone`,
   * rendered from Lichess's own asset set, not an image URL. Kept apart
   * from the avatar on purpose: it decorates the name, it does not stand
   * in for a face. Null on Chess.com, which has no flair concept. */
  flair: string | null;
  /** ISO 3166-1 alpha-2, uppercase. Null when undeclared. */
  countryCode: string | null;
}

export const EMPTY_PROFILE: PlayerProfile = {
  avatarUrl: null,
  flair: null,
  countryCode: null,
};

/**
 * The two outcomes a provider read can have, kept apart on purpose:
 * `failed` means we learned nothing (outage, timeout, unrecognizable
 * payload) and whatever is cached must stand; `fetched` is an answer,
 * even when that answer carries no avatar — profiles do get removed.
 */
export type ProfileFetch =
  | { status: "fetched"; profile: PlayerProfile }
  | { status: "failed" };

/** Chess.com's `country` field is a link like `.../pub/country/BR` — the
 * last path segment is already the code, no need to resolve the link. */
const ISO_ALPHA2 = /^[A-Za-z]{2}$/;

export function countryCodeFromUrl(url: string | undefined): string | null {
  const suffix = url?.split("/").pop() ?? "";
  return ISO_ALPHA2.test(suffix) ? suffix.toUpperCase() : null;
}

/**
 * Note what is *not* read here: `location`. It is free text and it is not
 * the flag — a real account answers `country: ".../BR"` alongside
 * `location: "Spain"`. Reading `location` would fly the wrong flag.
 */
const chessComProfileSchema = z.object({
  avatar: z.string().optional(),
  country: z.string().optional(),
});

/** Lichess omits `profile` until the person fills it, hence `.optional()`.
 * `flair` sits at the top level and is equally optional. No avatar field
 * exists on this endpoint for any account. */
const lichessProfileSchema = z.object({
  flair: z.string().optional(),
  profile: z.object({ flag: z.string().optional() }).optional(),
});

/** A profile is decoration around a name; a provider that accepts the
 * request but never answers must not hold a game open (or a connection
 * hostage). Five seconds covers every real provider and routes a hung
 * socket into the same empty-profile path as any other failure. */
const FETCH_TIMEOUT_MS = 5000;

/** Null on any failure — non-ok status, network error, timeout, bad JSON.
 * Callers turn that into `failed`, never into a definitive empty profile. */
async function fetchJson(url: string, doFetch: FetchFn): Promise<unknown | null> {
  try {
    const res = await doFetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // A profile is decoration around a name. A missing or broken one leaves
    // the initials in place; it must never fail a game from loading.
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchChessComProfile(
  username: string,
  opts: { fetch?: FetchFn } = {},
): Promise<ProfileFetch> {
  if (!USERNAME_PATTERN.test(username))
    return { status: "fetched", profile: EMPTY_PROFILE };
  const doFetch = opts.fetch ?? globalThis.fetch;

  const body = await fetchJson(`https://api.chess.com/pub/player/${username}`, doFetch);
  if (body === null) return { status: "failed" };
  const parsed = chessComProfileSchema.safeParse(body);
  // A shape we do not recognize is not a trustworthy "no avatar" — treat
  // it like a failed ask rather than an answer that clears anything.
  if (!parsed.success) return { status: "failed" };

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
  if (!USERNAME_PATTERN.test(username))
    return { status: "fetched", profile: EMPTY_PROFILE };
  const doFetch = opts.fetch ?? globalThis.fetch;

  const body = await fetchJson(`https://lichess.org/api/user/${username}`, doFetch);
  if (body === null) return { status: "failed" };
  // Same rule as chess.com above: an unrecognized payload must not be
  // read as a definitive empty profile.
  const parsed = lichessProfileSchema.safeParse(body);
  if (!parsed.success) return { status: "failed" };

  const flag = parsed.data.profile?.flag;
  return {
    status: "fetched",
    profile: {
      // Lichess has no profile pictures. Not "we don't read it yet" — the
      // endpoint carries no image field for any account.
      avatarUrl: null,
      flair: parsed.data.flair ?? null,
      countryCode: ISO_ALPHA2.test(flag ?? "") ? flag!.toUpperCase() : null,
    },
  };
}
