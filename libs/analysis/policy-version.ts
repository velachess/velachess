/**
 * Bumped whenever `classify-move.ts`'s classification policy changes, so a
 * cached report keyed on an older version is never read back as if it
 * still reflected the current rules. Read only by external cache callers
 * (`apps/web/src/games/browser-analysis/analysis-cache.ts`) — this module
 * never reads its own version, since it has no cache of its own.
 */
export const POLICY_VERSION = 1;
