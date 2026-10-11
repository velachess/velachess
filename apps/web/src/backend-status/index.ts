// useBackendStatus and getBackendStatus stay internal — the banner reads the
// store itself and no outside caller reads the raw status today. Re-export
// one here the day one does.
export { BackendStatusBanner } from "./backend-status-banner.tsx";
export { recordInfrastructureFailure, resetBackendStatus } from "./backend-status.ts";
