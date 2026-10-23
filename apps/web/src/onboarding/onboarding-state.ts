import { isSyncActive, type TrackedAccount } from "../games/import/index.ts";

/** An empty library reads differently with something on its way. */
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
  /** Per the server; undefined while the session is in flight. */
  onboarded: boolean | undefined;
  failed: boolean;
}

export function onboardingState(input: OnboardingInput): OnboardingState {
  // A failure is not an empty account: onboarding somebody whose backend is
  // down tells them to import what they already imported.
  if (input.failed) return { kind: "error" };
  if (input.games === undefined || !input.accounts || input.onboarded === undefined) {
    return { kind: "loading" };
  }

  if (input.games > 0) return { kind: "ready" };
  // Before `onboarded`, because the server marks onboarding done the moment
  // a connection sticks: a freshly connected account reads
  // `onboarded: true` while still syncing, and must stay covered.
  if (input.accounts.some((account) => isSyncActive(account.syncStatus))) {
    return { kind: "syncing" };
  }
  // Onboarding happens once: someone who disconnected everything gets the
  // empty library, which they can act on, not a modal with no way out.
  if (input.onboarded) return { kind: "no-games" };
  if (input.accounts.length === 0) return { kind: "onboarding" };

  return { kind: "no-games" };
}
