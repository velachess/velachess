/**
 * The React Query key prefixes the game caches hang off.
 *
 * Shared at the root rather than owned by one domain: `list` and `review`
 * read these caches, `import` invalidates them when games land, and an
 * invalidation only works if the write spells the key exactly as the read
 * does. One spelling, reachable from every domain, and no domain importing
 * another for a string.
 *
 * Two distinct prefixes, not one nested under the other: invalidating the
 * library does not touch an open game's record, so a write that means both
 * says both.
 */

/** The library: every filtered, paged read of the games list. */
export const gamesQueryKey = ["games"] as const;

/** One game's own record, keyed per id underneath this prefix. */
export const gameQueryKey = ["game"] as const;

/**
 * One game's analysis, keyed per id and per what produced it. A third
 * prefix rather than a branch of `gameQueryKey`, because React Query
 * matches by prefix: invalidating a game's record would otherwise reset
 * a running analysis and discard every ply it had graded.
 */
export const gameAnalysisQueryKey = ["game-analysis"] as const;
