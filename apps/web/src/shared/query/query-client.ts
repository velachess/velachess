import {
  isBaseApiError,
  isCancelledError,
  isInfrastructureError,
  isInvalidResponseError,
  isRetryableApiError,
  isUnauthorizedError,
  normalizeApiError,
} from "../api/errors.ts";
import { checkBackendHealth } from "../api/health.ts";
import { reportUnauthorized } from "../api/unauthorized.ts";
import {
  confirmBackendRecovery,
  getBackendStatus,
  recordInfrastructureFailure,
} from "../errors/backend-status.ts";
import { MutationCache, QueryCache, QueryClient } from "../libs/query/index.ts";

const RECOVERY_PROBE_DELAY_MS = 5_000;
let recoveryProbe: ReturnType<typeof setTimeout> | null = null;

function handleApiError(error: unknown) {
  const apiError = normalizeApiError(error);

  if (isCancelledError(apiError)) return;

  // 401 is an authentication state, not a failure to report: the session
  // ended (expired, revoked, signed out in another tab) and the app has
  // to stop pretending otherwise. Announced here, decided elsewhere —
  // see shared/api/unauthorized.ts.
  if (isUnauthorizedError(apiError)) {
    reportUnauthorized();
    return;
  }

  if (isInfrastructureError(apiError)) {
    recordInfrastructureFailure();
    scheduleRecoveryProbe();
    return;
  }

  if (isInvalidResponseError(apiError) || isBaseApiError(apiError)) {
    reportUnexpectedApiError(apiError);
  }
}

function reportUnexpectedApiError(error: unknown) {
  console.error("Unexpected API failure", error);
}

function scheduleRecoveryProbe() {
  if (recoveryProbe || getBackendStatus() === "available") return;

  recoveryProbe = setTimeout(() => {
    recoveryProbe = null;
    void runRecoveryProbe();
  }, RECOVERY_PROBE_DELAY_MS);
}

export function resetBackendRecoveryProbe() {
  if (!recoveryProbe) return;
  clearTimeout(recoveryProbe);
  recoveryProbe = null;
}

async function runRecoveryProbe() {
  if (getBackendStatus() === "available") return;

  try {
    await checkBackendHealth();
    confirmBackendRecovery();
  } catch (error) {
    const apiError = normalizeApiError(error, "health failed");
    if (isCancelledError(apiError)) return;
    if (isInvalidResponseError(apiError) || !isInfrastructureError(apiError)) {
      reportUnexpectedApiError(apiError);
    }
    scheduleRecoveryProbe();
  }
}

export function createQueryClient(options: { retry?: boolean | number } = {}) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: handleApiError,
    }),
    mutationCache: new MutationCache({
      onError: handleApiError,
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => shouldRetryQuery(failureCount, error, options),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: options.retry ?? false,
      },
    },
  });
}

export const queryClient = createQueryClient();

function shouldRetryQuery(
  failureCount: number,
  error: unknown,
  options: { retry?: boolean | number },
) {
  const apiError = normalizeApiError(error);
  if (isCancelledError(apiError)) return false;
  if (!isRetryableApiError(apiError)) return false;

  const retry = options.retry ?? 1;
  if (retry === true) return failureCount < 3;
  if (retry === false) return false;
  return failureCount < retry;
}
