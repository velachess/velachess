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

  // 401 is an authentication state, not a failure to report: the session
  // ended (expired, revoked, signed out in another tab) and the app has
  // to stop pretending otherwise. Announced here, decided elsewhere —
  // see api/unauthorized.ts.
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
    // A request that fails on infrastructure raises the banner, and nothing
    // lowers it: no probe, no timer, no retry ladder. A later success can't
    // be trusted to mean the outage ended — the session query alone refetches
    // on every navigation, so any healthy endpoint would hide a backend that
    // is still broken for everything else. The reload the banner asks for is
    // the reset.
    queryCache: new QueryCache({
      // Not every query is a request. `meta.engine` marks the ones whose
      // work runs on this device — Stockfish — and a search that fails
      // reaches its own screen through `isError`, so there is nothing
      // global to do with it and nothing to normalize it into.
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
