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
