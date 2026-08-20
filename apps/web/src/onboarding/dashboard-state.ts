/** Four of these five states used to all render as `0`, which is accurate but tells the wrong story for a new account. */

import type { Overview } from "../dashboard/queries.ts";
import type { TrackedAccount } from "../games/import/queries.ts";

export type DashboardState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "onboarding" }
  | { kind: "syncing" }
  | { kind: "no-games" }
  | { kind: "ready"; overview: Overview };

export interface DashboardInput {
  overview: Overview | undefined;
  accounts: TrackedAccount[] | undefined;
  failed: boolean;
}

const IN_FLIGHT = new Set(["queued", "active"]);

export function dashboardState(input: DashboardInput): DashboardState {
  // A failure is not an empty account. Onboarding somebody whose backend
  // is down would tell them to import what they already imported.
  if (input.failed) return { kind: "error" };
  if (!input.overview || !input.accounts) return { kind: "loading" };

  if (input.overview.games > 0) return { kind: "ready", overview: input.overview };
  if (input.accounts.length === 0) return { kind: "onboarding" };
  if (input.accounts.some((account) => IN_FLIGHT.has(account.syncState))) {
    return { kind: "syncing" };
  }

  return { kind: "no-games" };
}
