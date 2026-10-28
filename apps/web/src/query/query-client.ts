import {
  isBaseApiError,
  isCancelledError,
  isInfrastructureError,
  isInvalidResponseError,
  isUnauthorizedError,
  normalizeApiError,
  reportUnauthorized,
} from "../api/index.ts";
import { recordInfrastructureFailure } from "../backend-status/index.ts";
import { MutationCache, QueryCache, QueryClient } from "../libs/react-query.ts";

function handleApiError(error: unknown) {
  const apiError = normalizeApiError(error);

  if (isCancelledError(apiError)) return;

  // A 401 is an authentication state, not a failure to report: the session
  // ended and the app stops pretending otherwise. Announced here, decided
  // in api/unauthorized.ts.
  if (isUnauthorizedError(apiError)) {
    reportUnauthorized();
    return;
  }

  if (isInfrastructureError(apiError)) {
    recordInfrastructureFailure();
    return;
  }

  if (isInvalidResponseError(apiError) || isBaseApiError(apiError)) {
    reportUnexpectedApiError(apiError);
  }
}

function reportUnexpectedApiError(error: unknown) {
  console.error("Unexpected API failure", error);
}

export function createQueryClient() {
  return new QueryClient({
    // An infrastructure failure raises the banner and nothing lowers it: a
    // later success cannot be trusted to mean the outage ended, the session
    // query alone refetching on every navigation. The reload the banner asks
    // for is the reset.
    queryCache: new QueryCache({
      // `meta.engine` marks work that runs on this device, whose failure
      // reaches its own screen through `isError`.
      onError: (error, query) => {
        if (query.meta?.["engine"] === true) return;
        handleApiError(error);
      },
    }),
    mutationCache: new MutationCache({ onError: handleApiError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
