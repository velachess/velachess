/** Fake chess.com fetch serving the looper scenario from
 * @velachess/fixtures — data there, behavior here. */

import {
  LISTER_ARCHIVE_MONTH,
  LISTER_ARCHIVES_INDEX,
  LOOPER_ARCHIVE_MONTH,
  LOOPER_ARCHIVES_INDEX,
} from "@velachess/fixtures";

/** Any handle's profile exists: connecting confirms the handle there first. */
const PROFILE_URL = /\/pub\/player\/[^/]+$/;

export function chessComFixtureFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (PROFILE_URL.test(url)) return Response.json({});
    if (url.endsWith("/archives")) return Response.json(LOOPER_ARCHIVES_INDEX);
    if (url.endsWith("/2026/08")) return Response.json(LOOPER_ARCHIVE_MONTH);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/** Fully-tagged archive for the games list: ratings, clocks, openings, and
 * one game from each seat. */
export function chessComListingFixtureFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (PROFILE_URL.test(url)) return Response.json({});
    if (url.endsWith("/archives")) return Response.json(LISTER_ARCHIVES_INDEX);
    if (url.endsWith("/2026/06")) return Response.json(LISTER_ARCHIVE_MONTH);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}
