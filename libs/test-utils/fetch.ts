/** Fake chess.com fetch serving the looper scenario from
 * @velachess/fixtures — data there, behavior here. */

import {
  LISTER_ARCHIVE_MONTH,
  LISTER_ARCHIVES_INDEX,
  LOOPER_ARCHIVE_MONTH,
  LOOPER_ARCHIVES_INDEX,
  LOOPER_EXTRACT_ARCHIVE_MONTH,
  LOOPER_EXTRACT_ARCHIVES_INDEX,
} from "@velachess/fixtures";

export function chessComFixtureFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/archives")) return Response.json(LOOPER_ARCHIVES_INDEX);
    if (url.endsWith("/2026/08")) return Response.json(LOOPER_ARCHIVE_MONTH);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/** Fake chess.com fetch for the cycle-6 extraction scenario: three white
 * games — two supporting the French book, one blundering inside it. */
export function chessComExtractFixtureFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/archives")) return Response.json(LOOPER_EXTRACT_ARCHIVES_INDEX);
    if (url.endsWith("/2026/07")) return Response.json(LOOPER_EXTRACT_ARCHIVE_MONTH);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/** Fully-tagged archive for the games list: ratings, clocks, openings, and
 * one game from each seat. */
export function chessComListingFixtureFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/archives")) return Response.json(LISTER_ARCHIVES_INDEX);
    if (url.endsWith("/2026/06")) return Response.json(LISTER_ARCHIVE_MONTH);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}
