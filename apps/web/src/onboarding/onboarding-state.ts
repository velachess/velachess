import type { TrackedAccount } from "../games/import/queries.ts";

/** An empty library reads differently depending on whether anything is on its way. */
export type OnboardingState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "onboarding" }
  | { kind: "syncing" }
  | { kind: "no-games" }
  | { kind: "ready" };

export interface OnboardingInput {
  games: number | undefined;
  accounts: TrackedAccount[] | undefined;
  failed: boolean;
}

const IN_FLIGHT = new Set(["queued", "active"]);

export function onboardingState(input: OnboardingInput): OnboardingState {
  // A failure is not an empty account. Onboarding somebody whose backend
  // is down would tell them to import what they already imported.
  if (input.failed) return { kind: "error" };
  if (input.games === undefined || !input.accounts) return { kind: "loading" };

  if (input.games > 0) return { kind: "ready" };
  if (input.accounts.length === 0) return { kind: "onboarding" };
  if (input.accounts.some((account) => IN_FLIGHT.has(account.syncState))) {
    return { kind: "syncing" };
  }

  return { kind: "no-games" };
}
