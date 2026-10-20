/**
 * Bumped whenever `classify-move.ts`'s classification policy changes, so a
 * report stored under an older version is never read back as if it still
 * reflected the current rules. Read only by whoever persists a report
 * (`apps/web/src/games/analysis/analysis-db.ts`) — this module never
 * reads its own version, since it stores nothing.
 */
export const POLICY_VERSION = 1;
