/**
 * LandNewGames — the tail every source of new games runs: derived
 * repertoires grow first so the fresh book judges this pass, judging
 * replays against it, seeding reads the judgments. Shared by import-pgn
 * (this module) and accounts/sync-account (a genuinely different module)
 * so the two never drift apart — see the root AGENTS.md's "games/
 * land-new-games" section.
 *
 * Every dependency here is external, including `judgeGamesForUser` —
 * even though it is this slice's own module-mate in `games`, a slice
 * never calls another slice's handler directly, same module or not.
 */

type EnsureCandidateRepertoires = (
  userId: string,
  opts: { newGames: number },
) => Promise<void>;
type JudgeGamesForUser = (userId: string) => Promise<{ judged: number }>;
type SeedDrillsFromJudgments = (userId: string) => Promise<{ seeded: number }>;

export interface LandNewGamesDeps {
  ensureCandidateRepertoires: EnsureCandidateRepertoires;
  judgeGamesForUser: JudgeGamesForUser;
  seedDrillsFromJudgments: SeedDrillsFromJudgments;
}

export interface LandNewGamesOutcome {
  judged: number;
  seeded: number;
}

/**
 * Runs unconditionally (not gated on newGames > 0) so that a retry after
 * a partial failure still judges games an earlier pass missed.
 *
 * Preserves today's double-seed: `judgeGamesForUser` already seeds when
 * it judges something, yet this runs `seedDrillsFromJudgments` again
 * unconditionally right after — a known, deferred redundancy (see the
 * plan's "Deferred items"), not something this refactor fixes.
 */
export async function landNewGames(
  deps: LandNewGamesDeps,
  userId: string,
  newGames: number,
): Promise<LandNewGamesOutcome> {
  await deps.ensureCandidateRepertoires(userId, { newGames });
  const judgment = await deps.judgeGamesForUser(userId);
  const triage = await deps.seedDrillsFromJudgments(userId);

  return { judged: judgment.judged, seeded: triage.seeded };
}
