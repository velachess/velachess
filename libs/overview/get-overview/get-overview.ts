/**
 * GetOverview — the dashboard's four counters, one behavior, one place.
 * Each count is its own declared need: the slice never holds a Database
 * handle, only the four narrow readers the composition root satisfies.
 */

export type CountGames = (userId: string) => Promise<number>;
export type CountDeviations = (userId: string) => Promise<number>;
export type CountExercises = (userId: string) => Promise<number>;
export type CountDueCards = (userId: string, now: Date) => Promise<number>;

export interface GetOverviewDeps {
  countGames: CountGames;
  countDeviations: CountDeviations;
  countExercises: CountExercises;
  countDueCards: CountDueCards;
}

export interface Overview {
  games: number;
  deviations: number;
  exercises: number;
  dueCards: number;
}

/** One-call counters for the stats endpoint — no N queries from HTTP. */
export async function getOverview(
  deps: GetOverviewDeps,
  userId: string,
  now: Date = new Date(),
): Promise<Overview> {
  const [games, deviations, exercises, dueCards] = await Promise.all([
    deps.countGames(userId),
    deps.countDeviations(userId),
    deps.countExercises(userId),
    deps.countDueCards(userId, now),
  ]);

  return { games, deviations, exercises, dueCards };
}
