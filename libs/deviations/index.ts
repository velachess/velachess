/**
 * [DEVIATIONS] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel.
 */

export { listDeviationsForUser } from "./list-deviations/list-deviations.ts";
export type {
  ListDeviationsDeps,
  ListOwnDeviations,
  DeviationRow,
} from "./list-deviations/list-deviations.ts";
