/**
 * [OVERVIEW] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 */

export { getOverview } from "./get-overview/get-overview.ts";
export type {
  GetOverviewDeps,
  Overview,
  CountGames,
  CountDeviations,
  CountExercises,
  CountDueCards,
} from "./get-overview/get-overview.ts";
