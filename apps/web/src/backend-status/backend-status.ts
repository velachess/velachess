import { useSyncExternalStore } from "react";

type BackendStatus = "available" | "unavailable";

let status: BackendStatus = "available";
let failedSinceRetry = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function recordInfrastructureFailure() {
  failedSinceRetry = true;
  if (status === "unavailable") return;
  status = "unavailable";
  emit();
}

/** Lowers the outage only when every request the retry re-ran succeeded:
 * an unrelated success elsewhere is not evidence the backend recovered. */
export async function retryUnavailableBackend(refetch: () => Promise<unknown>) {
  failedSinceRetry = false;
  await refetch();
  if (!failedSinceRetry) resetBackendStatus();
}

export function resetBackendStatus() {
  status = "available";
  failedSinceRetry = false;
  emit();
}

export function getBackendStatus() {
  return status;
}

function subscribeToBackendStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBackendStatus() {
  return useSyncExternalStore(
    subscribeToBackendStatus,
    getBackendStatus,
    getBackendStatus,
  );
}
