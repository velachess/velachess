// ponytail: useBackendStatus stays internal to backend-status-banner.tsx —
// no outside caller reads the raw status today. Re-export it here the day
// one does.
export { BackendStatusBanner } from "./backend-status-banner.tsx";
export {
  confirmBackendRecovery,
  getBackendStatus,
  recordInfrastructureFailure,
  resetBackendStatus,
} from "./backend-status.ts";
