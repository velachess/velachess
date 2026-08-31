import { useSyncExternalStore } from "react";

type BackendStatus = "available" | "unavailable";

let status: BackendStatus = "available";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function recordInfrastructureFailure() {
  if (status === "unavailable") return;
  status = "unavailable";
  emit();
}

export function confirmBackendRecovery() {
  if (status === "available") return;
  status = "available";
  emit();
}

export function resetBackendStatus() {
  status = "available";
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
