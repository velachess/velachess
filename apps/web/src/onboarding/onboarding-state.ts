import { isSyncActive, type TrackedAccount } from "../games/import/queries.ts";

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
  /** Whether this person has ever finished onboarding, per the server.
   * `undefined` while the session is still in flight. */
  onboarded: boolean | undefined;
  failed: boolean;
}

export function onboardingState(input: OnboardingInput): OnboardingState {
  // A failure is not an empty account. Onboarding somebody whose backend
  // is down would tell them to import what they already imported.
  if (input.failed) return { kind: "error" };
  if (input.games === undefined || !input.accounts || input.onboarded === undefined) {
    return { kind: "loading" };
  }

  if (input.games > 0) return { kind: "ready" };
  // Onboarding happens once. Someone who has been through it and then
  // disconnected everything gets the empty library, not the tour again —
  // an empty screen they can act on, rather than a modal with no way out.
  if (input.onboarded) return { kind: "no-games" };
  if (input.accounts.length === 0) return { kind: "onboarding" };
  if (input.accounts.some((account) => isSyncActive(account.syncStatus))) {
    return { kind: "syncing" };
  }

  return { kind: "no-games" };
}
